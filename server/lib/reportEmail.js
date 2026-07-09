// Pure rendering of the daily committee digest: (results, health, meta) →
// {subject, html, text}. No AWS, no network — testable in isolation. Table
// layout + inline CSS because email clients ignore stylesheets; a plain-text
// alternative is built alongside.

import { getExitTimingAdvice } from "@stockjs/committee-engine/exitTimingAdvice.js";
import { describePortfolioHealth } from "@stockjs/committee-engine/portfolioHealth.js";
import { whatToDo } from "@stockjs/committee-engine/actionAdvice.js";

const TIER_COLORS = {
  "Strong Buy": "#1a7f37",
  Buy: "#2da44e",
  Hold: "#9a6700",
  Reduce: "#bc4c00",
  Sell: "#cf222e",
};

// Where the app is hosted. Deep links open the stock's detail view with the
// AI Committee tab active (HashRouter — the #/ fragment survives email-client
// link rewriting and needs no server-side routing on GitHub Pages).
const DEFAULT_APP_URL = "https://nnbrandon.github.io/stockjs";

const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const stockUrl = (appUrl, symbol) =>
  `${appUrl}/#/stock/${encodeURIComponent(symbol)}/committee`;

// A symbol rendered as a tappable link to its detail page. `inner` is the
// pre-styled label markup (e.g. a <strong>); we only add the anchor + color.
const symbolLink = (appUrl, symbol, inner) =>
  `<a href="${escapeHtml(stockUrl(appUrl, symbol))}" style="color:#0969da;text-decoration:none;">${inner}</a>`;

const fmtScore = (v) => (Number.isFinite(v) ? v.toFixed(0) : "—");
const fmtPrice = (n) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : null;

function shortDate(day) {
  const d = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function tierBadge(tier) {
  const color = TIER_COLORS[tier] || "#57606a";
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;background:${color};color:#ffffff;font-size:13px;font-weight:700;">${escapeHtml(tier)}</span>`;
}

// "Quality on sale": priced well below the 52-week high with strong finances.
function fireSaleBadge(fireSale) {
  const label = fireSale?.confidenceLabel
    ? ` · ${escapeHtml(fireSale.confidenceLabel)}`
    : "";
  return `<span style="display:inline-block;padding:1px 10px;border-radius:12px;background:#fff1e5;border:1px solid #e8590c;color:#bc4c00;font-size:12px;font-weight:700;">🔥 FIRE SALE${label}</span>`;
}

function describeTierChange(r) {
  const c = r.tierChange;
  const verb = c.direction === "upgrade" ? "upgraded" : "downgraded";
  return `${r.symbol} ${verb}: ${c.fromTier} → ${r.report.verdict.tier}`;
}

function subjectLine(results, meta) {
  const rated = results.filter((r) => r.report);
  const buys = rated.filter((r) => r.report.verdict.action === "BUY").length;
  const holds = rated.filter((r) => r.report.verdict.action === "HOLD").length;
  const sells = rated.filter((r) => r.report.verdict.action === "SELL").length;
  const fireSales = rated.filter((r) => r.report.verdict.fireSale).length;
  const changes = results.filter((r) => r.tierChange).length;

  const counts = [
    buys ? `${buys} Buy` : null,
    holds ? `${holds} Hold` : null,
    sells ? `${sells} Sell` : null,
    fireSales ? `${fireSales} 🔥 Fire Sale` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const changeNote = changes
    ? ` (${changes} change${changes === 1 ? "" : "s"})`
    : "";
  return `Portfolio committee — ${counts || "no verdicts"}${changeNote} — ${shortDate(meta.day)}`;
}

function healthLines(health) {
  if (!health) return [];
  const lines = [];
  if (Number.isFinite(health.weightedScore)) {
    lines.push(
      `Value-weighted committee score: ${health.weightedScore.toFixed(0)}/100 across ${health.ratedValuePct.toFixed(0)}% of portfolio value.`,
    );
  }
  if (health.pctInSellRated > 0) {
    lines.push(
      `${health.pctInSellRated.toFixed(0)}% of your portfolio value sits in names the committee would sell (${health.sellRatedSymbols.join(", ")}).`,
    );
  }
  for (const flag of health.flags || []) {
    lines.push(`${flag.severity === "warn" ? "⚠ " : ""}${flag.text}`);
  }
  return lines;
}

function sellDetails(report) {
  const pm = report.agents?.find((a) => a.key === "portfolioManager");
  const plan = pm?.plan;
  if (!plan || report.verdict.action !== "SELL") return null;
  return {
    reasons: (plan.reasons || []).slice(0, 4),
    trimPct: Number.isFinite(plan.trimPct) ? plan.trimPct : null,
    fullExit: Boolean(plan.fullExit),
  };
}

// Exit timing baked into every SELL/REDUCE, reasoned from the company's
// financial trajectory over the past year.
function holdingHorizon(r) {
  const v = r.report?.verdict;
  if (!v || v.action !== "SELL") return null;
  return getExitTimingAdvice({
    action: v.action,
    tier: v.tier,
    fundamentalScore: r.report.pillars?.fundamental,
    metrics: r.report.metrics,
  });
}

function newsMoodBlock(r) {
  const parts = [];
  if (r.newsMood) parts.push({ text: r.newsMood });
  if (r.topPositive?.title) {
    parts.push({
      prefix: "Most upbeat: ",
      title: r.topPositive.title,
      link: r.topPositive.link,
    });
  }
  if (r.topNegative?.title) {
    parts.push({
      prefix: "Most negative: ",
      title: r.topNegative.title,
      link: r.topNegative.link,
    });
  }
  return parts;
}

// The single plainest "next step" line for a holding (shared with the app).
function doThisLine(r) {
  const v = r.report.verdict;
  const plan = r.report.agents?.find((a) => a.key === "portfolioManager")?.plan;
  return whatToDo({ action: v.action, tier: v.tier, plan });
}

// One plain news line: the mood plus the single most relevant headline.
function plainNewsLine(r) {
  const parts = newsMoodBlock(r);
  if (!parts.length) return "";
  const mood = parts.find((p) => p.text)?.text;
  const headline = parts.find((p) => p.title);
  let out = mood ? escapeHtml(mood) : "";
  if (headline) {
    const title = escapeHtml(headline.title);
    const linked = headline.link
      ? `<a href="${escapeHtml(headline.link)}" style="color:#0969da;">${title}</a>`
      : `“${title}”`;
    out += `${out ? " — " : ""}${linked}`;
  }
  return out;
}

function holdingHtml(r, appUrl) {
  const cells = [];

  if (r.error) {
    return `<tr><td style="padding:14px 16px;border-top:1px solid #d8dee4;">
      ${symbolLink(appUrl, r.symbol, `<strong style="font-size:15px;">${escapeHtml(r.symbol)}</strong>`)}
      <span style="color:#cf222e;font-size:13px;"> — data fetch failed today (${escapeHtml(r.error)}); we'll try again tomorrow.</span>
    </td></tr>`;
  }

  if (!r.report) {
    const note = r.isFund
      ? "Fund/ETF — tracks a basket of holdings, so the committee doesn't rate it. Counted in portfolio health."
      : "Not enough data to run the committee (no financials or analyst coverage found).";
    return `<tr><td style="padding:14px 16px;border-top:1px solid #d8dee4;">
      ${symbolLink(appUrl, r.symbol, `<strong style="font-size:15px;">${escapeHtml(r.symbol)}</strong>`)}
      <span style="color:#57606a;font-size:13px;"> — ${escapeHtml(note)}</span>
    </td></tr>`;
  }

  const v = r.report.verdict;
  const pm = r.report.agents?.find((a) => a.key === "portfolioManager");

  const labeled = (label, text) =>
    `<div style="font-size:13px;color:#24292f;margin-bottom:4px;"><strong>${label}:</strong> ${text}</div>`;

  // Header — symbol, plain tier, score kept up front.
  cells.push(
    `<div style="margin-bottom:6px;">
      ${symbolLink(appUrl, r.symbol, `<strong style="font-size:16px;">${escapeHtml(r.symbol)}</strong>`)}
      &nbsp;${tierBadge(v.tier)}${v.fireSale ? `&nbsp;${fireSaleBadge(v.fireSale)}` : ""}
      <span style="color:#57606a;font-size:13px;">&nbsp;${fmtScore(v.composite)}/100 · ${escapeHtml(v.convictionLabel.toLowerCase())} confidence</span>
    </div>`,
  );

  if (r.tierChange) {
    const up = r.tierChange.direction === "upgrade";
    cells.push(
      `<div style="color:${up ? "#1a7f37" : "#cf222e"};font-size:12px;font-weight:600;margin-bottom:6px;">${up ? "↑" : "↓"} ${escapeHtml(describeTierChange(r))}</div>`,
    );
  }

  // The one-sentence answer.
  const answer = pm?.narrative || pm?.summary;
  if (answer)
    cells.push(
      `<div style="font-size:14px;color:#24292f;margin-bottom:8px;">${escapeHtml(answer)}</div>`,
    );

  cells.push(labeled("What to do", escapeHtml(doThisLine(r))));

  // Why — sells only (the specifics behind a sell-your-money call).
  const sell = sellDetails(r.report);
  if (sell?.reasons?.length)
    cells.push(labeled("Why", escapeHtml(sell.reasons.slice(0, 3).join("; "))));

  const horizon = holdingHorizon(r);
  if (horizon?.lines?.length)
    cells.push(labeled("Timing", escapeHtml(horizon.lines.join(" "))));

  const news = plainNewsLine(r);
  if (news) cells.push(labeled("News", news));

  return `<tr><td style="padding:14px 16px;border-top:1px solid #d8dee4;">${cells.join("")}</td></tr>`;
}

function holdingText(r, appUrl) {
  const lines = [];
  const link = () => lines.push(`  ${stockUrl(appUrl, r.symbol)}`);
  if (r.error) {
    lines.push(`${r.symbol}: data fetch failed today (${r.error}).`);
    link();
    return lines;
  }
  if (!r.report) {
    lines.push(
      `${r.symbol}: ${r.isFund ? "fund/ETF — not rated by the committee." : "not enough data to run the committee."}`,
    );
    link();
    return lines;
  }
  const v = r.report.verdict;
  const pm = r.report.agents?.find((a) => a.key === "portfolioManager");
  lines.push(
    `${r.symbol}: ${v.tier}${v.fireSale ? " · 🔥 FIRE SALE" : ""} — ${fmtScore(v.composite)}/100 (${v.convictionLabel.toLowerCase()} confidence)`,
  );
  link();
  if (r.tierChange)
    lines.push(
      `  ${r.tierChange.direction === "upgrade" ? "↑" : "↓"} ${describeTierChange(r)}`,
    );
  const answer = pm?.narrative || pm?.summary;
  if (answer) lines.push(`  ${answer}`);
  lines.push(`  What to do: ${doThisLine(r)}`);
  const sell = sellDetails(r.report);
  if (sell?.reasons?.length)
    lines.push(`  Why: ${sell.reasons.slice(0, 3).join("; ")}`);
  const horizon = holdingHorizon(r);
  if (horizon?.lines?.length) lines.push(`  Timing: ${horizon.lines.join(" ")}`);
  const parts = newsMoodBlock(r);
  const moodP = parts.find((p) => p.text)?.text;
  const headP = parts.find((p) => p.title);
  const newsBits = [];
  if (moodP) newsBits.push(moodP);
  if (headP) newsBits.push(`“${headP.title}”${headP.link ? ` ${headP.link}` : ""}`);
  if (newsBits.length) lines.push(`  News: ${newsBits.join(" — ")}`);
  return lines;
}

// Listing order: actionable verdicts first (best buys, then sells by
// urgency), Hold after them, and the unrated rows (no-data, funds, fetch
// errors) at the bottom. Ties break on composite, strongest score first.
const TIER_ORDER = {
  "Strong Buy": 0,
  Buy: 1,
  Sell: 2,
  Reduce: 3,
  Hold: 4,
};

function listingRank(r) {
  if (r.error) return 7;
  if (!r.report) return r.isFund ? 6 : 5;
  return TIER_ORDER[r.report.verdict.tier] ?? 5;
}

function sortForListing(results) {
  return [...results].sort((a, b) => {
    const rank = listingRank(a) - listingRank(b);
    if (rank !== 0) return rank;
    const ca = a.report?.verdict?.composite ?? -1;
    const cb = b.report?.verdict?.composite ?? -1;
    return cb - ca;
  });
}

/**
 * @param {Array} results per-symbol report results (see dailyReport.js)
 * @param {object|null} health analyzePortfolioHealth output
 * @param {object} meta {day, engineVersion, articlesScored, sentimentPartial,
 *                       archiveSpanDays, failures}
 */
// Committee track record (#2): plain lines from computeTrackRecord output.
// Empty until at least one horizon has enough graded verdicts.
function trackRecordLines(tr) {
  if (!tr) return [];
  // Plain-English versions of the numbers — the email is for a human, the raw
  // percentages/correlations live in the calibration log for tuning.
  const avgMove = (v) =>
    Math.abs(v) < 0.5 ? "flat" : `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
  const rhoWord = (r) => {
    if (r == null) return null;
    if (r <= -0.1) return "backwards (misleading)";
    if (r < 0.1) return "no help";
    if (r < 0.25) return "a little";
    if (r < 0.5) return "helpful";
    return "a strong guide";
  };
  const lines = [];
  for (const h of tr.horizons) {
    if (!h.enough) continue;
    // How each group of past calls actually moved.
    const bits = [];
    for (const [action, label] of [
      ["BUY", "Buy"],
      ["HOLD", "Hold"],
      ["SELL", "Sell"],
    ]) {
      const p = h.per[action];
      if (p.n)
        bits.push(
          `${label} ${avgMove(p.meanReturn)} (${p.n} stock${p.n === 1 ? "" : "s"})`,
        );
    }
    if (!bits.length) continue;
    let line = `Its calls from ~${h.horizon} days ago: ${bits.join(", ")}.`;
    if (Number.isFinite(h.spread)) {
      line +=
        h.spread >= 0
          ? ` The stocks it rated Buy did about ${h.spread.toFixed(0)}% better than the ones it rated Sell — a good sign it's calling direction right.`
          : ` The stocks it rated Sell actually did about ${Math.abs(h.spread).toFixed(0)}% better than its Buys — worth watching.`;
    }
    lines.push(line);

    // Which of the three signals actually predicted those moves, in words.
    const pv = h.predictive;
    const pvParts = [];
    for (const [pillar, label] of [
      ["fundamental", "finances"],
      ["technical", "trend"],
      ["sentiment", "news"],
    ]) {
      const word = rhoWord(pv?.[pillar]?.rho);
      if (word) pvParts.push(`${label} was ${word}`);
    }
    if (pvParts.length) {
      const n = Math.max(
        0,
        ...["technical", "fundamental", "sentiment"].map((p) => pv[p]?.n || 0),
      );
      lines.push(
        `Of the three signals, which actually predicted those moves: ${pvParts.join(", ")} (based on ${n} past calls).`,
      );
    }
  }
  return lines;
}

export function renderReportEmail(unsorted, health, meta) {
  const results = sortForListing(unsorted);
  const appUrl = meta.appUrl || DEFAULT_APP_URL;
  const subject = subjectLine(results, meta);
  const changes = results.filter((r) => r.tierChange);
  const failures = results.filter((r) => r.error);
  const hLines = healthLines(health);

  // ── HTML ────────────────────────────────────────────────────────────────
  const sections = [];

  if (changes.length) {
    const items = changes
      .map((r) => {
        const color =
          r.tierChange.direction === "upgrade" ? "#1a7f37" : "#cf222e";
        return `<li style="color:${color};font-weight:600;margin-bottom:4px;">${escapeHtml(describeTierChange(r))}</li>`;
      })
      .join("");
    sections.push(
      `<h2 style="font-size:15px;margin:18px 0 6px;">Tier changes</h2><ul style="margin:0 0 0 18px;padding:0;font-size:14px;">${items}</ul>`,
    );
  }

  const healthNarrative = describePortfolioHealth(health);
  if (hLines.length || healthNarrative) {
    const lead = healthNarrative
      ? `<p style="font-size:13px;color:#24292f;margin:0 0 8px;">${escapeHtml(healthNarrative)}</p>`
      : "";
    const items = hLines
      .map((l) => `<li style="margin-bottom:4px;">${escapeHtml(l)}</li>`)
      .join("");
    const list = items
      ? `<ul style="margin:0 0 0 18px;padding:0;font-size:13px;color:#24292f;">${items}</ul>`
      : "";
    sections.push(
      `<h2 style="font-size:15px;margin:18px 0 6px;">Portfolio health</h2>${lead}${list}`,
    );
  }

  const trLines = trackRecordLines(meta.trackRecord);
  if (trLines.length) {
    const items = trLines
      .map((l) => `<li style="margin-bottom:4px;">${escapeHtml(l)}</li>`)
      .join("");
    sections.push(
      `<h2 style="font-size:15px;margin:18px 0 6px;">Committee track record</h2>
       <p style="font-size:12px;color:#57606a;margin:0 0 6px;">A report card on the committee's own past calls — how the stocks it rated have actually moved since, so you can see if it's any good. (Based on each stock's price change, not your specific buys. Small samples, so treat it as a gut-check, not gospel.)</p>
       <ul style="margin:0 0 0 18px;padding:0;font-size:13px;color:#24292f;">${items}</ul>`,
    );
  }

  if (failures.length) {
    sections.push(
      `<p style="font-size:13px;color:#cf222e;">${failures.length} symbol${failures.length === 1 ? "" : "s"} failed to fetch today: ${escapeHtml(failures.map((r) => r.symbol).join(", "))}.</p>`,
    );
  }

  const rows = results.map((r) => holdingHtml(r, appUrl)).join("");
  sections.push(
    `<h2 style="font-size:15px;margin:18px 0 6px;">Your holdings</h2>
     <p style="font-size:12px;color:#57606a;margin:0 0 8px;">Tap any symbol to open it in the app with the AI Committee tab.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d8dee4;border-radius:8px;border-collapse:separate;overflow:hidden;">${rows}</table>
     <p style="font-size:12px;margin:12px 0 0;"><a href="${escapeHtml(`${appUrl}/#/`)}" style="color:#0969da;text-decoration:none;">Open your portfolio →</a></p>`,
  );

  const footerBits = [
    `Engine ${escapeHtml(meta.engineVersion)}`,
    `data as of ${escapeHtml(meta.day)} (America/Los_Angeles)`,
    `${meta.articlesScored} article${meta.articlesScored === 1 ? "" : "s"} scored today`,
  ];
  if (meta.sentimentPartial) {
    footerBits.push("news mood partial/unavailable today (model error)");
  }
  if (Number.isFinite(meta.archiveSpanDays) && meta.archiveSpanDays < 14) {
    footerBits.push(
      `news history still warming up (${Math.max(0, Math.round(meta.archiveSpanDays))} day${Math.round(meta.archiveSpanDays) === 1 ? "" : "s"})`,
    );
  }

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f8fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td>
        <h1 style="font-size:18px;margin:0 0 4px;">AI Committee — daily portfolio digest</h1>
        <div style="font-size:12px;color:#57606a;margin-bottom:12px;">${escapeHtml(shortDate(meta.day))} · ${results.length} holding${results.length === 1 ? "" : "s"}</div>
        ${sections.join("\n")}
        <p style="font-size:11px;color:#8c959f;margin-top:20px;border-top:1px solid #d8dee4;padding-top:12px;">
          ${footerBits.map(escapeHtml).join(" · ")}<br/>
          Automated summary generated by your own AI Committee engine — not investment advice.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  // ── Plain text ──────────────────────────────────────────────────────────
  const textLines = [`AI COMMITTEE — DAILY PORTFOLIO DIGEST (${meta.day})`, ""];
  if (changes.length) {
    textLines.push("TIER CHANGES");
    for (const r of changes) textLines.push(`  ${describeTierChange(r)}`);
    textLines.push("");
  }
  if (hLines.length || healthNarrative) {
    textLines.push("PORTFOLIO HEALTH");
    if (healthNarrative) textLines.push(`  ${healthNarrative}`);
    for (const l of hLines) textLines.push(`  ${l}`);
    textLines.push("");
  }
  if (failures.length) {
    textLines.push(
      `${failures.length} symbol(s) failed to fetch today: ${failures.map((r) => r.symbol).join(", ")}`,
      "",
    );
  }
  if (trLines.length) {
    textLines.push("COMMITTEE TRACK RECORD");
    for (const l of trLines) textLines.push(`  ${l}`);
    textLines.push("");
  }
  textLines.push("YOUR HOLDINGS");
  for (const r of results) {
    textLines.push(...holdingText(r, appUrl), "");
  }
  textLines.push(`Open your portfolio: ${appUrl}/#/`, "");
  textLines.push(footerBits.join(" | "));
  textLines.push(
    "Automated summary generated by your own AI Committee engine — not investment advice.",
  );

  return { subject, html, text: textLines.join("\n") };
}
