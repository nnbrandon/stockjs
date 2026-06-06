import { clamp, toCloses } from "../indicators";
import { neutral } from "./helpers";

// Critiques the bull & bear cases, hunting for contradictions and blind spots.
// It doesn't pick a side; it lowers conviction where the evidence conflicts.
export function runDevilsAdvocate({ dataScout, sentiment, candles = [] }) {
  const caveats = [];
  const m = dataScout.metrics;
  const closes = toCloses(candles);

  const uptrend = Number.isFinite(m.sma50) && m.price > m.sma50;
  const overbought = Number.isFinite(m.rsi14) && m.rsi14 >= 70;
  const techStrong =
    Number.isFinite(dataScout.technicalScore) && dataScout.technicalScore >= 60;
  const fundWeak =
    Number.isFinite(dataScout.fundamentalScore) &&
    dataScout.fundamentalScore < 45;
  const sentScore = sentiment.score;
  const sentPositive = Number.isFinite(sentScore) && sentScore >= 58;
  const sentNegative = Number.isFinite(sentScore) && sentScore <= 42;

  let penalty = 0;
  const flag = (text, p) => {
    caveats.push(text);
    penalty += p;
  };

  if (uptrend && overbought)
    flag(
      "The trend is up, but the stock has run up fast — buyers may be chasing it.",
      8,
    );
  if (techStrong && fundWeak)
    flag(
      "The rising price isn't backed by the company's finances — the move could be fragile.",
      10,
    );
  if (sentPositive && Number.isFinite(m.sma50) && m.price < m.sma50)
    flag(
      "The news is upbeat, but the price is still falling — the good story isn't showing up in the stock yet.",
      8,
    );
  if (sentNegative && uptrend)
    flag(
      "The price is rising even though the news is negative — that can reverse if reality catches up.",
      6,
    );
  if (dataScout.fundamentalScore == null)
    flag(
      "No company financials are saved — we can't judge whether it's fairly priced.",
      6,
    );
  if (closes.length < 200)
    flag(
      "Less than a year of price history — the long-term trend is unknown.",
      6,
    );
  if (sentiment.raw && sentiment.raw.counts.total < 3)
    flag("The news read is based on very few articles — easily skewed.", 5);
  if (Number.isFinite(m.volatility) && m.volatility > 55)
    flag(
      "The price swings a lot, which makes it harder and riskier to trade.",
      5,
    );

  const confidencePenalty = clamp(penalty, 0, 45);

  return {
    key: "devil",
    name: "Devil's Advocate",
    role: "The skeptic: mixed signals & blind spots",
    confidencePenalty,
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
