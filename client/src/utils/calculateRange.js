const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function calculateRange(days) {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 1); // +1 because Yahoo period2 is exclusive
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
}
