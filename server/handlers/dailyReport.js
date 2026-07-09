// The daily AI Committee email report. Triggered by EventBridge Scheduler
// with payload {"action": "dailyReport"} — never reachable through the public
// Function URL (index.js branches on top-level event.action, which Function
// URL events don't carry).
//
// The analysis itself lives in lib/committeePipeline.js (shared with the
// on-demand action=runCommittee); this handler owns the multi-user email
// concerns: who gets a report, whether anything is worth sending, rendering,
// SES delivery, and per-user send bookkeeping. Results are persisted with a
// `latest` block per symbol so the UI (action=committeeResults) renders the
// exact same run the email was built from.

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

import { COMMITTEE_ENGINE_VERSION } from "@stockjs/committee-engine/analyst/index.js";

import {
  analyzeSymbols,
  archiveSpanDays,
  computeUserView,
  nextSymbolStateEntries,
  pacificDay,
  updateArticleArchive,
} from "../lib/committeePipeline.js";
import { getJson, loadState, saveState, toHoldings } from "../lib/reportState.js";
import { renderReportEmail } from "../lib/reportEmail.js";
import { LEGACY_PORTFOLIO_KEY, PORTFOLIO_PREFIX } from "./portfolioSync.js";

// Compatibility re-exports — scripts and tests import these from here.
export { pacificDay, updateArticleArchive };

const s3 = new S3Client({});
const ses = new SESClient({});

/** REPORT_SYMBOLS="AAPL:100:150.25,MSFT:50:300,VTI" → holdings. */
export function parseReportSymbols(raw) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [symbol, quantity, avgCostBasis] = entry.split(":");
      return {
        symbol: symbol.toUpperCase(),
        quantity: Number.isFinite(Number(quantity)) && quantity !== undefined
          ? Number(quantity)
          : null,
        avgCostBasis:
          Number.isFinite(Number(avgCostBasis)) && avgCostBasis !== undefined
            ? Number(avgCostBasis)
            : null,
      };
    });
}

/**
 * Everyone the report goes to: one user per portfolios/<email>.json synced
 * from the browser, plus two fallbacks — the pre-multi-user portfolio.json
 * (attributed to REPORT_EMAIL until that address re-syncs under the new
 * scheme) and the REPORT_SYMBOLS env var when nothing was ever synced.
 */
async function loadReportUsers(bucket, fallbackEmail) {
  const users = [];

  if (bucket) {
    try {
      const listed = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: PORTFOLIO_PREFIX }),
      );
      for (const obj of listed.Contents ?? []) {
        if (!obj.Key?.endsWith(".json")) continue;
        const data = await getJson(bucket, obj.Key);
        const holdings = toHoldings(data);
        const email = typeof data?.email === "string" ? data.email : null;
        if (!email || !holdings) continue;
        users.push({
          email,
          holdings,
          updatedAt: data.updatedAt ?? null,
          source: "synced",
        });
      }
    } catch (err) {
      console.error("dailyReport: failed to list synced portfolios:", err);
    }

    if (fallbackEmail && !users.some((u) => u.email === fallbackEmail)) {
      try {
        const data = await getJson(bucket, LEGACY_PORTFOLIO_KEY);
        const holdings = toHoldings(data);
        if (holdings) {
          users.push({
            email: fallbackEmail,
            holdings,
            updatedAt: data?.updatedAt ?? null,
            source: "synced-legacy",
          });
        }
      } catch (err) {
        console.error("dailyReport: failed to read legacy portfolio:", err);
      }
    }
  }

  if (!users.length) {
    const holdings = parseReportSymbols(process.env.REPORT_SYMBOLS);
    if (holdings.length) {
      users.push({
        email: fallbackEmail,
        holdings,
        updatedAt: null,
        source: "env",
      });
    }
  }

  return users;
}

export async function runDailyReport() {
  const startedAt = Date.now();
  const bucket = process.env.REPORT_STATE_BUCKET || "";
  // The verified SES identity every report is sent FROM (recipients are the
  // per-portfolio addresses). Also the fallback recipient for pre-multi-user
  // portfolios and REPORT_SYMBOLS.
  const senderEmail = process.env.REPORT_EMAIL || "";
  const dryRun = process.env.REPORT_DRY_RUN === "1";

  const users = await loadReportUsers(bucket, senderEmail);
  if (!users.length) {
    return {
      statusCode: 400,
      body: "No synced portfolios and REPORT_SYMBOLS is empty — nothing to report on",
    };
  }
  for (const u of users) {
    console.log(
      `dailyReport: ${u.email || "(no email)"} — ${u.holdings.length} positions (${u.source}${u.updatedAt ? `, updated ${u.updatedAt}` : ""})`,
    );
  }
  if (!bucket) {
    console.warn(
      "dailyReport: REPORT_STATE_BUCKET not set — running stateless (no history, no tier-change detection).",
    );
  }

  const state = await loadState(bucket);
  const symbolState = state.symbols || {};
  // Per-user send bookkeeping, keyed by email. Old single-user states kept
  // these fields at the top level — migrate them to the sender's entry.
  const userState = { ...(state.users || {}) };
  if (!state.users && (state.lastSendDay || state.lastHealthFlags)) {
    userState[senderEmail || "default"] = {
      lastSendDay: state.lastSendDay ?? null,
      lastHealthFlags: state.lastHealthFlags ?? [],
    };
  }

  // ── Analyze once per unique symbol across all users ─────────────────────
  // (quantity/cost basis differ per user and are overlaid later).
  const uniqueHoldings = [
    ...new Map(
      users.flatMap((u) => u.holdings).map((h) => [h.symbol, h]),
    ).values(),
  ];
  const { symbolResults, articlesScored, sentimentPartial, day, generatedAt } =
    await analyzeSymbols(uniqueHoldings, state);
  const resultBySymbol = new Map(symbolResults.map((r) => [r.symbol, r]));

  // ── Per user: health + email (sent every day — user preference; tier
  // changes and health flags are highlighted in the email rather than
  // gating whether it goes out) ───────────────────────────────────────────
  const nextUserState = {};
  const summaries = [];
  let sendsAttempted = 0;
  let sendsFailed = 0;

  for (const user of users) {
    const userKey = user.email || "default";
    const { results, health, trackRecord } = computeUserView(
      user.holdings,
      resultBySymbol,
    );

    // Calibration log (#3): per-pillar predictive value — the evidence for
    // whether the 35/45/20 pillar weights still earn their keep.
    for (const h of trackRecord?.horizons ?? []) {
      const parts = ["fundamental", "technical", "sentiment"]
        .filter((p) => Number.isFinite(h.predictive?.[p]?.rho))
        .map((p) => `${p} ρ=${h.predictive[p].rho.toFixed(2)} (n=${h.predictive[p].n})`);
      if (parts.length)
        console.log(`predictive value [${userKey}] ~${h.horizon}d: ${parts.join(", ")}`);
    }

    const warnFlags = (health?.flags ?? []).filter((f) => f.severity === "warn");
    const baseUserState = {
      lastSendDay: userState[userKey]?.lastSendDay ?? null,
      lastHealthFlags: warnFlags.map((f) => ({
        kind: f.kind,
        symbols: f.symbols,
      })),
      health,
      healthGeneratedAt: generatedAt,
    };

    const spanDays = Math.min(
      ...results.filter((r) => !r.error && !r.isFund).map((r) =>
        archiveSpanDays(r.articles),
      ),
      Infinity,
    );

    const meta = {
      day,
      engineVersion: COMMITTEE_ENGINE_VERSION,
      articlesScored,
      sentimentPartial,
      archiveSpanDays: Number.isFinite(spanDays) ? spanDays : null,
      // Committee track record (#2) — grades of past verdicts vs current price.
      trackRecord,
      // Base URL for the email's deep links (defaults to the GH Pages site in
      // reportEmail.js if unset). Override with APP_URL for a custom domain.
      appUrl: process.env.APP_URL || undefined,
    };

    const { subject, html, text } = renderReportEmail(results, health, meta);

    if (dryRun) {
      console.log(`dailyReport DRY RUN [${userKey}] — subject: ${subject}`);
      console.log(html);
      // Also write the rendered email where a human can open it (local test
      // runs; on Lambda /tmp is writable and this is best-effort anyway).
      try {
        const { writeFileSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const slug = userKey.replace(/[^a-z0-9]+/gi, "-");
        const path = `${tmpdir()}/stockjs-report-${slug}.html`;
        writeFileSync(path, html);
        writeFileSync(`${tmpdir()}/stockjs-report-${slug}.txt`, text);
        console.log(`dailyReport DRY RUN — rendered email written to ${path}`);
      } catch {
        // logging above is enough
      }
      nextUserState[userKey] = { ...baseUserState, lastSendDay: day };
      summaries.push(`${userKey}: dry-run "${subject}"`);
      continue;
    }

    if (!senderEmail || !user.email) {
      console.error(
        `dailyReport: cannot send to ${userKey} — REPORT_EMAIL (sender) or recipient missing`,
      );
      if (userState[userKey]) nextUserState[userKey] = userState[userKey];
      summaries.push(`${userKey}: send SKIPPED (no sender/recipient)`);
      continue;
    }

    sendsAttempted += 1;
    try {
      // Sent FROM the verified REPORT_EMAIL identity TO the portfolio owner.
      await ses.send(
        new SendEmailCommand({
          Source: senderEmail,
          Destination: { ToAddresses: [user.email] },
          Message: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: html, Charset: "UTF-8" },
              Text: { Data: text, Charset: "UTF-8" },
            },
          },
        }),
      );
      nextUserState[userKey] = { ...baseUserState, lastSendDay: day };
      summaries.push(`${userKey}: sent "${subject}"`);
    } catch (err) {
      // SES-sandbox recipients who haven't clicked their verification link
      // land here. Keep their previous bookkeeping so tomorrow's run
      // re-detects the same health flags and retries.
      sendsFailed += 1;
      console.error(`dailyReport: send to ${user.email} failed:`, err);
      if (userState[userKey]) nextUserState[userKey] = userState[userKey];
      summaries.push(`${userKey}: send FAILED (${err.name || "error"})`);
    }
  }

  // ── State to persist (article archive + history must accrue daily) ──────
  // Overlay onto a FRESH read: the analysis takes minutes, and saving over
  // whatever a concurrent action=runCommittee persisted meanwhile would
  // silently erase its symbols. Failed symbols keep their previous state.
  const freshState = bucket ? await loadState(bucket) : {};
  const nextState = {
    ...freshState,
    version: 3,
    updatedAt: generatedAt,
    lastRunDay: day,
    users: { ...(freshState.users || {}), ...nextUserState },
    symbols: {
      ...symbolState,
      ...(freshState.symbols || {}),
      ...nextSymbolStateEntries(symbolResults, generatedAt),
    },
  };

  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  const summary = summaries.join("; ");

  // Send-before-persist invariant: if every attempted send failed, don't
  // advance the shared symbol history — tomorrow's run then re-detects
  // today's tier changes and retries. On a partial failure the state does
  // persist (other users' emails already went out), so the failed user may
  // miss changes that happened exactly today.
  if (sendsAttempted > 0 && sendsFailed === sendsAttempted) {
    console.error(
      `dailyReport: all ${sendsAttempted} sends failed — state not persisted`,
    );
    return { statusCode: 502, body: summary };
  }

  if (bucket) await saveState(bucket, nextState);

  console.log(
    `dailyReport: ${summary} — ${uniqueHoldings.length} symbols, ${articlesScored} articles scored, ${elapsed()}`,
  );
  return { statusCode: 200, body: summary };
}
