import { clamp } from "../indicators";
import { avg, neutral } from "./helpers";

// Hard-wired to argue the downside. It collects every bearish data point the
// other agents surfaced and grades how strong the case against buying is.
export function runBear({ dataScout, sentiment, pillarScores }) {
  const bearFindings = [
    ...dataScout.findings.filter((f) => f.polarity === "bear"),
    ...sentiment.findings.filter((f) => f.polarity === "bear"),
  ];

  // Bear strength rises as the (bullish) pillar scores fall and as the count
  // of severe negatives grows.
  const meanScore = avg(Object.values(pillarScores).filter(Number.isFinite));
  const severe = bearFindings.filter((f) => f.weight >= 2).length;
  const bearStrength = clamp(
    (Number.isFinite(meanScore) ? 100 - meanScore : 50) + severe * 6,
    0,
    100,
  );

  const summary = bearFindings.length
    ? `Found ${bearFindings.length} warning sign${bearFindings.length > 1 ? "s" : ""}; the case against buying is ${bearStrength.toFixed(0)}/100.`
    : "Couldn't find real warning signs — little reason for concern here.";

  return {
    key: "bear",
    name: "The Bear",
    role: "The pessimist: what could go wrong",
    score: bearStrength,
    scoreIsRisk: true,
    stance:
      bearStrength >= 60
        ? "Caution"
        : bearStrength >= 40
          ? "Watchful"
          : "Not worried",
    summary,
    findings: bearFindings.length
      ? bearFindings
      : [neutral("No real warning signs found", 1)],
  };
}
