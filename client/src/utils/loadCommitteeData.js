import {
  getAnalysis,
  getAnnual,
  getCommitteeHistory,
  getEarnings,
  getNewsBySymbol,
  getQuarterly,
  getStockDataByDateRange,
} from "../db";
import calculateRange from "./calculateRange";
import { mergeEarningsIntoQuarterly } from "./mergeEarningsIntoQuarterly";

const FUNDAMENTALS_RANGE = calculateRange(365 * 25);
const COMMITTEE_RANGE = calculateRange(365);

export async function loadCommitteeData(symbol) {
  const { startDate, endDate } = COMMITTEE_RANGE;
  const [chartData, quarterly, annual, earnings, news, history, analysis] =
    await Promise.all([
      getStockDataByDateRange(symbol, startDate, endDate),
      getQuarterly(
        symbol,
        FUNDAMENTALS_RANGE.startDate,
        FUNDAMENTALS_RANGE.endDate,
      ),
      getAnnual(
        symbol,
        FUNDAMENTALS_RANGE.startDate,
        FUNDAMENTALS_RANGE.endDate,
      ),
      getEarnings(symbol),
      getNewsBySymbol(symbol),
      getCommitteeHistory(symbol),
      getAnalysis(symbol),
    ]);

  return {
    chartData: chartData || [],
    quarterly: mergeEarningsIntoQuarterly(quarterly ?? [], earnings ?? []),
    annual: annual ?? [],
    earnings: earnings ?? [],
    news: news ?? [],
    history: history ?? [],
    analysis: analysis ?? null,
  };
}
