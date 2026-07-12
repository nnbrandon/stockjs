// Position-aware advice (v9, display-only). The committee's verdict is the same
// for everyone; this adds the one thing a real analyst managing YOUR book would
// factor in — where you personally stand on this holding. It matters mostly
// around selling, where an unrealized gain or loss changes how you'd execute.
//
// Pure + dependency-free. The caller computes `gainPct` from whatever cost-basis
// field its side uses (client `averageCostBasis` vs. server `avgCostBasis`), so
// this helper never touches either name and reads identically on every surface.
//
// Beginner voice: full sentences, no jargon. Every tax mention is hedged with
// "in a taxable account" and stays general — no rates, no wash-sale mechanics,
// never specific tax advice.

/**
 * @param {{ gainPct:number, action:string }} input
 *   gainPct — the position's unrealized gain/loss in percent (e.g. 35 = +35%).
 *   action  — the committee verdict's action ("BUY" | "HOLD" | "SELL" | …).
 * @returns {{ line:string } | null} A single plain-English line, or null when
 *   there is nothing worth saying (routine position, non-finite input).
 */
export function buildPositionRead({ gainPct, action } = {}) {
  if (!Number.isFinite(gainPct)) return null;
  const g = Math.round(Math.abs(gainPct));

  if (action === "SELL") {
    if (gainPct >= 20) {
      return {
        line: `You're up about ${g}% on this position. Selling means paying capital-gains tax on that profit in a taxable account — trimming in stages spreads that out.`,
      };
    }
    if (gainPct <= -10) {
      return {
        line: `You're down about ${g}% on this position. One silver lining: selling locks in a tax loss you can use against other gains in a taxable account.`,
      };
    }
    return {
      line: "Your position is roughly flat to modestly moved, so selling has little tax impact either way.",
    };
  }

  if (gainPct >= 100) {
    return {
      line: "This position has doubled for you — nothing to do today, just remember a big winner also means a bigger tax bill whenever you eventually sell from a taxable account.",
    };
  }

  return null;
}
