export default function isMarketOpen() {
  const now = new Date();

  // Get the current date/time as it appears in New York (handles DST automatically).
  const nyNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );

  const day = nyNow.getDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;

  const totalMinutes = nyNow.getHours() * 60 + nyNow.getMinutes();

  // Regular market hours: 9:30 AM (570) – 4:00 PM (960) ET.
  // Note: does not account for US market holidays or early-close days.
  return totalMinutes >= 570 && totalMinutes < 960;
}
