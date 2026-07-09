import { clamp, toCloses } from "../indicators";
import { neutral } from "./helpers";

// Critiques the bull & bear cases, hunting for contradictions and blind spots.
// It doesn't pick a side. Genuine contradictions (the signals disagree) pull
// the composite toward neutral; data-quality gaps (thin history, few articles)
// only lower confidence — a stock isn't less of a sell just because we have
// less data on it.
export function runDevilsAdvocate({
  dataScout,
  sentiment,
  candles = [],
  quarterly = [],
  analysis = null,
}) {
  const caveats = [];
  const m = dataScout.metrics;
  const closes = toCloses(candles);
  const DAY_MS = 24 * 60 * 60 * 1000;

  const uptrend = Number.isFinite(m.sma50) && m.price > m.sma50;
  const overbought = Number.isFinite(m.rsi14) && m.rsi14 >= 70;
  const techStrong =
    Number.isFinite(dataScout.technicalScore) && dataScout.technicalScore >= 60;
  const techWeak =
    Number.isFinite(dataScout.technicalScore) && dataScout.technicalScore <= 40;
  const fundStrong =
    Number.isFinite(dataScout.fundamentalScore) &&
    dataScout.fundamentalScore >= 60;
  const fundWeak =
    Number.isFinite(dataScout.fundamentalScore) &&
    dataScout.fundamentalScore < 45;
  const sentScore = sentiment.score;
  const sentPositive = Number.isFinite(sentScore) && sentScore >= 58;
  const sentNegative = Number.isFinite(sentScore) && sentScore <= 42;

  let contradictionPenalty = 0;
  let dataQualityPenalty = 0;
  // Genuine "the signals disagree" points, kept separate from data-quality
  // caveats so the narrative can surface the sharpest one as its concession.
  const contradictionList = [];
  const contradiction = (text, p) => {
    caveats.push(text);
    contradictionList.push({ text, weight: p });
    contradictionPenalty += p;
  };
  const dataGap = (text, p) => {
    caveats.push(text);
    dataQualityPenalty += p;
  };

  if (uptrend && overbought)
    contradiction(
      "The trend is up, but the stock has run up fast — buyers may be chasing it.",
      8,
    );
  if (techStrong && fundWeak)
    contradiction(
      "The rising price isn't backed by the company's finances — the move could be fragile.",
      10,
    );
  if (techWeak && fundStrong)
    contradiction(
      "The business looks healthy but the price keeps falling — the market may know something the numbers don't show yet.",
      8,
    );
  if (sentPositive && Number.isFinite(m.sma50) && m.price < m.sma50)
    contradiction(
      "The news is upbeat, but the price is still falling — the good story isn't showing up in the stock yet.",
      8,
    );
  if (sentNegative && uptrend)
    contradiction(
      "The price is rising even though the news is negative — that can reverse if reality catches up.",
      6,
    );

  if (dataScout.fundamentalScore == null)
    dataGap(
      "No company financials are saved — we can't judge whether it's fairly priced.",
      6,
    );
  if (closes.length < 200)
    dataGap(
      "Less than a year of price history — the long-term trend is unknown.",
      6,
    );
  if (sentiment.raw && sentiment.raw.counts.total < 3)
    dataGap("The news read is based on very few articles — easily skewed.", 5);
  if (!analysis || !Number.isFinite(analysis.forwardEps))
    dataGap(
      "No analyst forecasts available — we can't see which way expectations are moving.",
      3,
    );
  if (Number.isFinite(m.volatility) && m.volatility > 55)
    dataGap(
      "The price swings a lot, so any single reading here is less reliable.",
      5,
    );

  // Stale data: a verdict is only as fresh as what it was computed from.
  const newestCandle = candles.length
    ? new Date(candles.at(-1).date).getTime()
    : NaN;
  if (Number.isFinite(newestCandle)) {
    const daysOld = (Date.now() - newestCandle) / DAY_MS;
    if (daysOld > 7)
      dataGap(
        `The saved price data is ${Math.round(daysOld)} days old — refresh this symbol before acting on the verdict.`,
        6,
      );
  }
  const newestQuarter = quarterly.reduce((latest, r) => {
    const t = new Date(r.date).getTime();
    return Number.isFinite(t) && t > latest ? t : latest;
  }, -Infinity);
  if (Number.isFinite(newestQuarter) && newestQuarter > 0) {
    const daysOld = (Date.now() - newestQuarter) / DAY_MS;
    if (daysOld > 200)
      dataGap(
        "The latest saved financials are more than six months old — the fundamentals read may be outdated.",
        4,
      );
  }

  contradictionPenalty = clamp(contradictionPenalty, 0, 30);
  dataQualityPenalty = clamp(dataQualityPenalty, 0, 20);
  const confidencePenalty = clamp(
    contradictionPenalty + dataQualityPenalty,
    0,
    45,
  );

  return {
    key: "devil",
    name: "Devil's Advocate",
    role: "The skeptic: mixed signals & blind spots",
    confidencePenalty,
    contradictionPenalty,
    dataQualityPenalty,
    // Strongest-first, for the narrative's concession slot.
    contradictions: contradictionList
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .map((c) => c.text),
    stance:
      caveats.length >= 3
        ? "Many concerns"
        : caveats.length
          ? "A few concerns"
          : "No concerns",
    summary: caveats.length
      ? `Raised ${caveats.length} concern${caveats.length > 1 ? "s" : ""} that lower our confidence by ${confidencePenalty.toFixed(0)} points.`
      : "Found no major conflicts between the signals.",
    findings: caveats.length
      ? caveats.map((c) => neutral(c, 1))
      : [neutral("The signals agree with each other", 1)],
  };
}
