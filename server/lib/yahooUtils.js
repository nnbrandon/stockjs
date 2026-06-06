// Yahoo sometimes wraps numbers as { raw, fmt }; sometimes they're plain.
export const num = (v) =>
  v && typeof v === "object" && "raw" in v
    ? v.raw
    : typeof v === "number"
      ? v
      : null;

export const toIso = (v) => {
  if (!v) return null;
  const d =
    v instanceof Date ? v : new Date(num(v) != null ? num(v) * 1000 : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
