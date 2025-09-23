export default function isMarketOpen() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false; // closed on weekends

  // Convert to Eastern Time (New York)
  const nyNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const hours = nyNow.getHours();
  const minutes = nyNow.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // Market open: 9:30am (570) to 4:00pm (960)
  return totalMinutes >= 570 && totalMinutes < 960;
}
