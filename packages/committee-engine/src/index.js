// Barrel for the most-used engine entry points. Deep imports
// ("@stockjs/committee-engine/analyst/indicators" etc.) are also supported
// via the package exports map.

export {
  runAnalystCommittee,
  COMMITTEE_ENGINE_VERSION,
} from "./analyst/index.js";
export { getVerdictContext } from "./analyst/verdictContext.js";
export {
  getPreviousSnapshot,
  getTierChange,
  getScoreSeries,
} from "./analyst/verdictHistory.js";
export { mergeEarningsIntoQuarterly } from "./mergeEarningsIntoQuarterly.js";
export { analyzePortfolioHealth } from "./portfolioHealth.js";
export { isFundSymbol, isFundInstrumentType } from "./isFundSymbol.js";
export { getGuardrail } from "./guardrails.js";
export {
  selectNewsForAnalysis,
  hasFinbertScore,
} from "./selectNewsForAnalysis.js";
export {
  FINBERT_MODEL_ID,
  FINBERT_MAX_CHARS,
  NEUTRAL_SCORE,
  prepareFinbertText,
  toSignedScore,
} from "./finbertScore.js";
export { toIsoDate } from "./dateUtils.js";
