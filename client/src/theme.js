// theme.js
import { createTheme } from "@mui/material/styles";

const fontFamily = [
  "Geist",
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "Roboto",
  "sans-serif",
].join(", ");

const fontFamilyMono = [
  "Geist Mono",
  "ui-monospace",
  "SFMono-Regular",
  "Menlo",
  "monospace",
].join(", ");

const fontFamilyDisplay = ["Instrument Serif", "Georgia", "serif"].join(", ");

const sharedTypography = {
  fontFamily,
  fontSize: 14,
  htmlFontSize: 14,
  body1: { fontSize: 14, letterSpacing: "-0.005em" },
  body2: { fontSize: 13, letterSpacing: "-0.005em" },
  // Display: for the big company name in the header
  h1: {
    fontFamily: fontFamilyDisplay,
    fontWeight: 400,
    fontSize: 38,
    lineHeight: 1,
    letterSpacing: "-0.015em",
  },
  // Overline: for "WATCHLIST" / stat labels
  overline: {
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    lineHeight: 1.4,
  },
  button: {
    fontWeight: 500,
    letterSpacing: "0.02em",
    textTransform: "none",
  },
};

const sharedShape = { borderRadius: 8 };

// Custom token "namespace" we attach to the theme so components can read
// monospace/display fonts and bespoke chip radii without rebuilding them.
const customTokens = {
  fonts: {
    body: fontFamily,
    mono: fontFamilyMono,
    display: fontFamilyDisplay,
  },
  radius: {
    base: 8,
    sm: 6,
    chip: 16,
  },
};

// ─── Dark palette (mockup) ───────────────────────────────────────────
const darkTokens = {
  bgDefault: "#08090b",
  bgPaper: "#0e0f13",
  bgElevated: "#15171c",
  bgHover: "#1a1d23",
  divider: "rgba(255, 255, 255, 0.06)",
  dividerStrong: "rgba(255, 255, 255, 0.14)",
  textPrimary: "#f4f4f5",
  textSecondary: "#9ca0a8",
  textDisabled: "#5d626c",
  success: "#22c55e",
  successSoft: "rgba(34, 197, 94, 0.12)",
  error: "#ef4444",
  errorSoft: "rgba(239, 68, 68, 0.12)",
  hoverOverlay: "rgba(244, 244, 245, 0.04)",
};

// ─── Light palette (mirrored equivalents) ────────────────────────────
const lightTokens = {
  bgDefault: "#f7f7f8",
  bgPaper: "#ffffff",
  bgElevated: "#f1f2f4",
  bgHover: "#e9eaee",
  divider: "rgba(0, 0, 0, 0.06)",
  dividerStrong: "rgba(0, 0, 0, 0.14)",
  textPrimary: "#16181d",
  textSecondary: "#5d626c",
  textDisabled: "#9ca0a8",
  success: "#16a34a",
  successSoft: "rgba(22, 163, 74, 0.12)",
  error: "#dc2626",
  errorSoft: "rgba(220, 38, 38, 0.12)",
  hoverOverlay: "rgba(0, 0, 0, 0.04)",
};

function buildTheme(mode, tokens) {
  return createTheme({
    palette: {
      mode,
      primary: { main: tokens.textPrimary },
      success: { main: tokens.success },
      error: { main: tokens.error },
      divider: tokens.divider,
      background: {
        default: tokens.bgDefault,
        paper: tokens.bgPaper,
      },
      text: {
        primary: tokens.textPrimary,
        secondary: tokens.textSecondary,
        disabled: tokens.textDisabled,
      },
    },
    typography: sharedTypography,
    shape: sharedShape,
    custom: {
      ...customTokens,
      tokens,
    },
    components: buildTableOverrides(tokens),
  });
}

// Shared MUI Table styling — applied to every <Table>/<TablePagination> in the
// app so they match the mockup's clean, minimal aesthetic.
function buildTableOverrides(tokens) {
  return {
    MuiTableContainer: {
      styleOverrides: {
        root: {
          backgroundColor: "transparent",
          boxShadow: "none",
          borderRadius: 0,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          "& .MuiTableCell-head": {
            backgroundColor: "transparent",
            color: tokens.textSecondary,
            fontFamily,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            borderBottom: `1px solid ${tokens.divider}`,
            padding: "12px 16px",
            whiteSpace: "nowrap",
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontFamily,
          fontSize: 13,
          color: tokens.textPrimary,
          borderBottom: `1px solid ${tokens.divider}`,
          padding: "12px 16px",
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: "background-color 120ms ease",
          "&:hover": { backgroundColor: tokens.bgHover },
          "&:last-of-type .MuiTableCell-body": { borderBottom: "none" },
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        root: {
          color: tokens.textSecondary,
          borderTop: `1px solid ${tokens.divider}`,
          backgroundColor: "transparent",
        },
        toolbar: { minHeight: 48 },
      },
    },
    MuiTableSortLabel: {
      styleOverrides: {
        root: {
          color: tokens.textSecondary,
          "&.Mui-active": { color: tokens.textPrimary },
        },
        icon: { color: `${tokens.textSecondary} !important` },
      },
    },
  };
}

export const darkTheme = buildTheme("dark", darkTokens);
export const lightTheme = buildTheme("light", lightTokens);
