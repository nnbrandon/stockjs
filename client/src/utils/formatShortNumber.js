export default function formatShortNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return "--";
  const sign = num < 0 ? "-" : "";
  const absNum = Math.abs(num);
  if (absNum >= 1e12) return sign + (absNum / 1e12).toFixed(2) + "T";
  if (absNum >= 1e9) return sign + (absNum / 1e9).toFixed(2) + "B";
  if (absNum >= 1e6) return sign + (absNum / 1e6).toFixed(2) + "M";
  if (absNum >= 1e3) return sign + (absNum / 1e3).toFixed(2) + "K";
  return sign + absNum.toString();
}
