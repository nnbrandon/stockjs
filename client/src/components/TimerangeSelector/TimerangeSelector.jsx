import { useEffect, useState } from "react";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import calculateRange from "../../utils/calculateRange";

const RANGES = [
  { id: "1W", label: "1W", days: 7 },
  { id: "1M", label: "1M", days: 30 },
  { id: "3M", label: "3M", days: 90 },
  { id: "6M", label: "6M", days: 180 },
  { id: "1Y", label: "1Y", days: 365 },
  { id: "5Y", label: "5Y", days: 365 * 5 },
  { id: "ALL", label: "ALL", days: 365 * 25 },
];

const DEFAULT_RANGE = "1Y";

const groupSx = {
  background: "var(--palette-bg-paper)",
  border: "1px solid var(--palette-divider)",
  borderRadius: "var(--shape-radius)",
  padding: "3px",
  gap: "2px",
};

const buttonSx = {
  padding: "6px 12px",
  borderRadius: "var(--shape-radius-sm) !important",
  border: "none !important",
  fontFamily: "var(--font-mono)",
  fontSize: "11.5px",
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "none",
  color: "var(--palette-text-secondary)",
  transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
  "&:hover": {
    color: "var(--palette-text-primary)",
    background: "var(--palette-hover-overlay)",
  },
  "&.Mui-selected": {
    background: "var(--palette-bg-elevated)",
    color: "var(--palette-text-primary)",
    boxShadow: "inset 0 0 0 1px var(--palette-divider-strong)",
  },
  "&.Mui-selected:hover": {
    background: "var(--palette-bg-elevated)",
  },
};

export default function TimerangeSelector({ onChange }) {
  const [selectedId, setSelectedId] = useState(DEFAULT_RANGE);

  useEffect(() => {
    const initial = RANGES.find((r) => r.id === DEFAULT_RANGE);
    onChange?.(calculateRange(initial.days));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (_event, newId) => {
    if (!newId) return; // ignore deselection
    setSelectedId(newId);
    const range = RANGES.find((r) => r.id === newId);
    if (range) onChange?.(calculateRange(range.days));
  };

  return (
    <ToggleButtonGroup
      value={selectedId}
      exclusive
      onChange={handleChange}
      aria-label="Time range"
      sx={groupSx}
    >
      {RANGES.map((range) => (
        <ToggleButton key={range.id} value={range.id} sx={buttonSx}>
          {range.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
