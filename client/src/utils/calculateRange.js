const formatDate = (date) => date.toISOString().split("T")[0];

export default function calculateRange(days) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
}
