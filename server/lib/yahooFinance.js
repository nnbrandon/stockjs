import YahooFinance from "yahoo-finance2";

// Reuse one client across warm Lambda invocations so cookies/crumb are cached.
export const yahooFinance = new YahooFinance();
