export default function prepareSparklineData(stockData, days = 30) {
  if (!stockData?.length || stockData.length < 2) {
    return {
      data: [],
      dates: [],
      price: null,
      change: null,
      changePct: null,
      isUp: true,
    };
  }

  // Your data is already sorted oldest → newest, so slice from the end
  const slice = stockData.slice(-days);
  const data = slice.map((d) => d.close);
  const dates = slice.map((d) => d.shortenedDate);

  // Day-over-day change (for the % badge)
  const lastClose = stockData.at(-1).close;
  const prevClose = stockData.at(-2).close;
  const change = lastClose - prevClose;
  const changePct = (change / prevClose) * 100;

  return {
    data,
    dates,
    price: lastClose,
    change,
    changePct,
    isUp: changePct >= 0,
  };
}
