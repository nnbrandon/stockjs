const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Yahoo's period2 is exclusive, so the end is "tomorrow" to include today.
const exclusiveEndDate = () => {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 1);
  return formatDate(endDate);
};

export default function calculateRange(days) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return {
    startDate: formatDate(startDate),
    endDate: exclusiveEndDate(),
  };
}

/**
 * Range that starts at an explicit `YYYY-MM-DD` and ends today. Used by the
 * live poll to fetch only the candles at/after the last stored one — usually
 * just today's in-progress candle, plus any sessions missed while the app was
 * closed — instead of re-downloading months of unchanged history every minute.
 */
export function rangeFromDate(startDate) {
  return { startDate, endDate: exclusiveEndDate() };
}
