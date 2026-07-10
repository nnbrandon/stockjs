// Static reference table: roughly what a "normal" trailing P/E looks like for
// each sector, so a stock's valuation can be read against companies like it —
// not just against its own past. Keeps the engine pure and offline (comparing
// against the user's own handful of tracked stocks was rejected: too small and
// skewed a sample to define "peers").
//
// Keys are Yahoo's own `assetProfile.sector` strings. Bands are deliberately
// WIDE and conservative — approximate long-run sector medians, not a live
// feed. They anchor plain-English context ("cheap/expensive for its industry"),
// never a precise verdict. asOf 2026-01 — revisit yearly.
//
// typicalPE: [low, high] trailing-P/E band a typical profitable member trades
// in. (netMargin/revGrowth kept for future use; only P/E is scored today.)

export const SECTOR_BENCHMARKS = {
  Technology: { typicalPE: [20, 35], typicalNetMargin: 15, typicalRevGrowth: 12 },
  "Financial Services": { typicalPE: [8, 15], typicalNetMargin: 20, typicalRevGrowth: 6 },
  Healthcare: { typicalPE: [15, 28], typicalNetMargin: 10, typicalRevGrowth: 8 },
  "Consumer Cyclical": { typicalPE: [14, 26], typicalNetMargin: 7, typicalRevGrowth: 7 },
  "Consumer Defensive": { typicalPE: [17, 26], typicalNetMargin: 7, typicalRevGrowth: 4 },
  "Communication Services": { typicalPE: [13, 25], typicalNetMargin: 12, typicalRevGrowth: 7 },
  Industrials: { typicalPE: [15, 25], typicalNetMargin: 9, typicalRevGrowth: 6 },
  Energy: { typicalPE: [8, 16], typicalNetMargin: 8, typicalRevGrowth: 3 },
  Utilities: { typicalPE: [15, 22], typicalNetMargin: 11, typicalRevGrowth: 3 },
  "Real Estate": { typicalPE: [16, 32], typicalNetMargin: 20, typicalRevGrowth: 5 },
  "Basic Materials": { typicalPE: [10, 20], typicalNetMargin: 9, typicalRevGrowth: 4 },
};

export const SECTOR_BENCHMARKS_AS_OF = "2026-01";

/**
 * How a trailing P/E compares with what's typical for its sector.
 * Returns null when the sector is unknown or the band doesn't apply, so a
 * missing sector never affects the score.
 *
 * score: 0–100, higher = cheaper for the sector. Inside the band reads
 * neutral (45–60); far below scales up toward ~80; far above down toward ~25.
 *
 * @param {number} pe      trailing P/E
 * @param {string} sector  Yahoo assetProfile.sector
 * @returns {{score:number, verdict:"cheap"|"fair"|"rich", low:number, high:number}|null}
 */
export function sectorValuationRead(pe, sector) {
  if (!Number.isFinite(pe) || pe <= 0 || !sector) return null;
  const bench = SECTOR_BENCHMARKS[sector];
  if (!bench) return null;
  const [low, high] = bench.typicalPE;

  let score;
  let verdict;
  if (pe < low) {
    // Below the band → cheaper than peers. Scale from the band's low (60)
    // down to half the low (≈80, capped).
    const floor = low * 0.5;
    const t = (low - pe) / Math.max(low - floor, 1e-6); // 0 at low, 1 at floor
    score = 60 + Math.min(Math.max(t, 0), 1) * 20;
    verdict = "cheap";
  } else if (pe > high) {
    // Above the band → pricier than peers. Scale from the band's high (45)
    // down toward ~25 as it reaches twice the high.
    const ceil = high * 2;
    const t = (pe - high) / Math.max(ceil - high, 1e-6); // 0 at high, 1 at 2×high
    score = 45 - Math.min(Math.max(t, 0), 1) * 20;
    verdict = "rich";
  } else {
    // Inside the band → typical for the sector. Nudge within 45–60 by where
    // it sits in the band (nearer the low end = a touch cheaper).
    const t = (pe - low) / Math.max(high - low, 1e-6); // 0 at low, 1 at high
    score = 60 - t * 15;
    verdict = "fair";
  }
  return { score, verdict, low, high };
}
