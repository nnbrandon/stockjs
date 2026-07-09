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
    "Its long-term price trend has broken down",
  );
  add(
    Number.isFinite(m.mom60),
    m.mom60 < -10,
    "It's dropped more than 10% in the last three months",
  );
  add(
    Number.isFinite(m.drawdown),
    m.drawdown < -25,
    "It's down more than 25% from its recent high",
  );
  add(
    Number.isFinite(m.revenueGrowthYoY) || Number.isFinite(m.netIncomeGrowthYoY),
    m.revenueGrowthYoY < 0 || m.netIncomeGrowthYoY < -15,
    "The business is shrinking — falling sales or profit",
  );
  add(
    Number.isFinite(m.netMarginChange),
    m.netMarginChange <= -3,
    "Its profit margins are shrinking",
  );
  add(
    Number.isFinite(m.fcfMargin),
    m.fcfMargin < 0,
    "It's burning cash instead of making it",
  );
  add(
    Number.isFinite(m.debtToEquity),
    m.debtToEquity > 2,
    "It's carrying a lot of debt",
  );
  add(
    Number.isFinite(m.earningsBeatRate) || Number.isFinite(m.lastEpsSurprise),
    m.earningsBeatRate < 50 || m.lastEpsSurprise < -5,
    "It keeps missing profit expectations",
  );
  add(
    Number.isFinite(m.revisionsUp30d) && Number.isFinite(m.revisionsDown30d),
    m.revisionsUp30d + m.revisionsDown30d >= 3 &&
      m.revisionsDown30d > 2 * m.revisionsUp30d,
    "Analysts are cutting their forecasts",
  );
  add(
    Number.isFinite(sentimentScore),
    sentimentScore <= 40,
    "The news has turned negative",
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
