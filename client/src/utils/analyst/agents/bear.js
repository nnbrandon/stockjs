import { clamp } from "../indicators";
import { avg, bear, bull, neutral } from "./helpers";

// The classic reasons a long-term holder exits a position. Each check is
// evaluated only when its data exists, so missing data never counts as a
// signal in either direction.
function buildExitChecklist(metrics = {}, sentimentScore) {
  const m = metrics;
  const checks = [];
  const add = (available, hit, text) => {
    if (available) checks.push({ hit, text });
  };

  add(
    Number.isFinite(m.price) && Number.isFinite(m.sma200),
    m.price < m.sma200,
    "The long-term price trend is broken (trading below its 200-day average)",
  );
  add(
    Number.isFinite(m.mom60),
    m.mom60 < -10,
    "Momentum has turned firmly negative (down more than 10% over 3 months)",
  );
  add(
    Number.isFinite(m.drawdown),
    m.drawdown < -25,
    "In a deep decline — down more than 25% from its recent high",
  );
  add(
    Number.isFinite(m.revenueGrowthYoY) || Number.isFinite(m.netIncomeGrowthYoY),
    m.revenueGrowthYoY < 0 || m.netIncomeGrowthYoY < -15,
    "The business is going backwards — shrinking sales or sharply lower profit",
  );
  add(
    Number.isFinite(m.netMarginChange),
    m.netMarginChange <= -3,
    "Profitability is eroding compared to a year ago",
  );
  add(
    Number.isFinite(m.earningsBeatRate) || Number.isFinite(m.lastEpsSurprise),
    m.earningsBeatRate < 50 || m.lastEpsSurprise < -5,
    "Falling short of Wall Street's profit expectations",
  );
  add(
    Number.isFinite(sentimentScore),
    sentimentScore <= 40,
    "The news around the company has turned negative",
  );

  return checks;
}

// Hard-wired to argue the downside. It collects every bearish data point the
// other agents surfaced, runs a classic "should a holder exit?" checklist,
// and grades how strong the case against owning the stock is.
export function runBear({ dataScout, sentiment, pillarScores }) {
  const bearFindings = [
    ...dataScout.findings.filter((f) => f.polarity === "bear"),
    ...sentiment.findings.filter((f) => f.polarity === "bear"),
  ];

  const checks = buildExitChecklist(dataScout.metrics, sentiment.score);
  const triggered = checks.filter((c) => c.hit);

  // Bear strength rises as the (bullish) pillar scores fall, as severe
  // negatives pile up, and as exit signals trigger.
  const meanScore = avg(Object.values(pillarScores).filter(Number.isFinite));
  const severe = bearFindings.filter((f) => f.weight >= 2).length;
  const bearStrength = clamp(
    (Number.isFinite(meanScore) ? 100 - meanScore : 50) * 0.75 +
      severe * 5 +
      triggered.length * 7,
    0,
    100,
  );

  const findings = [];
  if (checks.length) {
    findings.push(
      triggered.length
        ? bear(
            `${triggered.length} of ${checks.length} classic sell signals are flashing:`,
            triggered.length >= 3 ? 2 : 1,
          )
        : bull(
            `None of the ${checks.length} classic sell signals are flashing`,
            1,
          ),
    );
    for (const c of triggered) findings.push(bear(c.text, 1));
  }
  // The most severe warnings the other agents raised, without repeating the
  // whole list.
  for (const f of bearFindings.filter((f) => f.weight >= 2)) findings.push(f);

  const summary = triggered.length
    ? `${triggered.length} of ${checks.length} sell signals triggered — the case against owning this is ${bearStrength.toFixed(0)}/100.`
    : bearFindings.length
      ? `No hard sell signals, but ${bearFindings.length} thing${bearFindings.length > 1 ? "s" : ""} worth watching — downside case ${bearStrength.toFixed(0)}/100.`
      : "Couldn't find real warning signs — little reason for concern here.";

  return {
    key: "bear",
    name: "The Bear",
    role: "The pessimist: reasons to sell or stay away",
    score: bearStrength,
    scoreIsRisk: true,
    exitSignals: { triggered: triggered.length, total: checks.length },
    exitReasons: triggered.map((c) => c.text),
    stance:
      bearStrength >= 60
        ? "Caution"
        : bearStrength >= 40
          ? "Watchful"
          : "Not worried",
    summary,
    findings: findings.length
      ? findings
      : [neutral("No real warning signs found", 1)],
  };
}
