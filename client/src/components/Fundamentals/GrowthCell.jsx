import { TableCell } from "@mui/material";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

const growthCellSx = (value) => ({
  color:
    value > 0
      ? "var(--palette-success)"
      : value < 0
        ? "var(--palette-error)"
        : "inherit",
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 500,
  whiteSpace: "nowrap",
  textAlign: "right",
  "& > span": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-end",
  },
});

/**
 * Right-aligned, color-coded percentage cell with an up/down arrow.
 * Renders an em-dash when the value is null or non-finite.
 */
export default function GrowthCell({ value }) {
  if (value == null || !Number.isFinite(value)) {
    return <TableCell align="right">—</TableCell>;
  }
  return (
    <TableCell sx={growthCellSx(value)}>
      <span>
        {value.toFixed(2)}%{value > 0 && <ArrowDropUpIcon fontSize="small" />}
        {value < 0 && <ArrowDropDownIcon fontSize="small" />}
      </span>
    </TableCell>
  );
}
