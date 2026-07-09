// Pure rendering of the daily committee digest: (results, health, meta) →
// {subject, html, text}. No AWS, no network — testable in isolation. Table
// layout + inline CSS because email clients ignore stylesheets; a plain-text
// alternative is built alongside.

import { getExitTimingAdvice } from "@stockjs/committee-engine/exitTimingAdvice.js";

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

function fireSaleHead(fireSale) {
  return `Fire sale${fireSale.confidenceLabel ? ` — ${fireSale.confidenceLabel.toLowerCase()} confidence` : ""}: priced low on a healthy business, with room to bounce back.`;
}

// Reasons first, cautions after — one flat list for both HTML and text.
function fireSaleItems(fireSale) {
  return [
    ...(fireSale.reasons ?? []),
    ...(fireSale.cautions ?? []).map((c) => `Keep in mind: ${c}`),
  ];
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

  cells.push(
    `<div style="margin-bottom:6px;">
      ${symbolLink(appUrl, r.symbol, `<strong style="font-size:16px;">${escapeHtml(r.symbol)}</strong>`)}
      &nbsp;${tierBadge(v.tier)}${v.fireSale ? `&nbsp;${fireSaleBadge(v.fireSale)}` : ""}
      <span style="color:#57606a;font-size:13px;">&nbsp;score ${fmtScore(v.composite)}/100 · ${escapeHtml(v.convictionLabel)} confidence</span>
    </div>`,
  );

  if (v.fireSale) {
    const items = fireSaleItems(v.fireSale)
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
    cells.push(
      `<div style="font-size:12px;color:#bc4c00;background:#fff8f3;border:1px solid #ffd8a8;border-radius:6px;padding:8px 12px;margin-bottom:6px;">
        <div style="font-weight:700;">🔥 ${escapeHtml(fireSaleHead(v.fireSale))}</div>
        ${items ? `<ul style="margin:4px 0 0 18px;padding:0;">${items}</ul>` : ""}
      </div>`,
    );
  }

  if (r.tierChange) {
    const color = r.tierChange.direction === "upgrade" ? "#1a7f37" : "#cf222e";
    cells.push(
      `<div style="color:${color};font-size:13px;font-weight:600;margin-bottom:6px;">${escapeHtml(describeTierChange(r))} (was ${fmtScore(r.tierChange.fromComposite)} on ${escapeHtml(r.tierChange.fromDay)})</div>`,
    );
  }

  const chairVerdict = pm?.narrative || pm?.summary;
  if (chairVerdict) {
    cells.push(
      `<div style="font-size:13px;color:#24292f;margin-bottom:6px;">${escapeHtml(chairVerdict)}</div>`,
    );
  }

  const mood = newsMoodBlock(r);
  if (mood.length) {
    const moodHtml = mood
      .map((m) => {
        if (m.text) return escapeHtml(m.text);
        const title = escapeHtml(m.title);
        const linked = m.link
          ? `<a href="${escapeHtml(m.link)}" style="color:#0969da;">${title}</a>`
          : `“${title}”`;
        return `${escapeHtml(m.prefix)}${linked}`;
      })
      .join("<br/>");
    cells.push(
      `<div style="font-size:12px;color:#57606a;margin-bottom:6px;">${moodHtml}</div>`,
    );
  }

  const sell = sellDetails(r.report);
  if (sell) {
    const reasonItems = sell.reasons
      .map((reason) => `<li>${escapeHtml(reason)}</li>`)
      .join("");
    const trim =
      sell.trimPct != null
        ? `<div style="font-weight:600;margin-top:4px;">${
            sell.fullExit
              ? "Suggested action: exit the position."
              : `Suggested action: trim about ${sell.trimPct}% of the position and reassess the rest.`
          }</div>`
        : "";
    cells.push(
      `<div style="font-size:12px;color:#82071e;background:#fff1f0;border-radius:6px;padding:8px 12px;">
        <div style="font-weight:700;">Why the committee would sell:</div>
        <ul style="margin:4px 0 0 18px;padding:0;">${reasonItems}</ul>${trim}
      </div>`,
    );
  }

  const horizon = holdingHorizon(r);
  if (horizon) {
    const items = horizon.lines
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join("");
    cells.push(
      `<div style="font-size:12px;color:#24292f;background:#f6f8fa;border:1px solid #d8dee4;border-radius:6px;padding:8px 12px;margin-top:6px;">
        <div style="font-weight:700;">⏳ ${escapeHtml(horizon.headline)}</div>
        <ul style="margin:4px 0 0 18px;padding:0;">${items}</ul>
      </div>`,
    );
  }

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
    `${r.symbol}: ${v.tier}${v.fireSale ? " · 🔥 FIRE SALE" : ""} — score ${fmtScore(v.composite)}/100 (${v.convictionLabel} confidence)`,
  );
  link();
  if (v.fireSale) {
    lines.push(`  ${fireSaleHead(v.fireSale)}`);
    for (const item of fireSaleItems(v.fireSale)) lines.push(`   - ${item}`);
  }
  if (r.tierChange) {
    lines.push(`  ${describeTierChange(r)}`);
  }
  if (pm?.narrative || pm?.summary)
    lines.push(`  ${pm.narrative || pm.summary}`);
  if (r.newsMood) lines.push(`  ${r.newsMood}`);
  if (r.topPositive?.title)
    lines.push(
      `  Most upbeat: ${r.topPositive.title} ${r.topPositive.link || ""}`,
    );
  if (r.topNegative?.title)
    lines.push(
      `  Most negative: ${r.topNegative.title} ${r.topNegative.link || ""}`,
    );
  const sell = sellDetails(r.report);
  if (sell) {
    lines.push("  Why the committee would sell:");
    for (const reason of sell.reasons) lines.push(`   - ${reason}`);
    if (sell.trimPct != null) {
      lines.push(
        sell.fullExit
          ? "  Suggested action: exit the position."
          : `  Suggested action: trim about ${sell.trimPct}% and reassess.`,
      );
    }
  }
  const horizon = holdingHorizon(r);
  if (horizon) {
    lines.push(`  ${horizon.headline}`);
    for (const line of horizon.lines) lines.push(`   - ${line}`);
  }
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

  if (hLines.length) {
    const items = hLines
      .map((l) => `<li style="margin-bottom:4px;">${escapeHtml(l)}</li>`)
      .join("");
    sections.push(
      `<h2 style="font-size:15px;margin:18px 0 6px;">Portfolio health</h2><ul style="margin:0 0 0 18px;padding:0;font-size:13px;color:#24292f;">${items}</ul>`,
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
  if (hLines.length) {
    textLines.push("PORTFOLIO HEALTH");
    for (const l of hLines) textLines.push(`  ${l}`);
    textLines.push("");
  }
  if (failures.length) {
    textLines.push(
      `${failures.length} symbol(s) failed to fetch today: ${failures.map((r) => r.symbol).join(", ")}`,
      "",
    );
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
