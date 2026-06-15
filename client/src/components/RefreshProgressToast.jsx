import {
  Snackbar,
  Paper,
  Box,
  Typography,
  LinearProgress,
  Chip,
  Stack,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";

const STATUS_ICON = {
  pending: <HourglassEmptyIcon fontSize="small" color="disabled" />,
  done: <CheckCircleIcon fontSize="small" color="success" />,
  error: <ErrorIcon fontSize="small" color="error" />,
};

export default function RefreshProgressToast({
  open,
  symbols,
  statuses,
  onClose,
}) {
  const total = symbols.length;
  const settled = symbols.filter((s) => statuses[s] !== "pending").length;
  const failed = symbols.filter((s) => statuses[s] === "error").length;
  const isComplete = total > 0 && settled === total;
  const percent = total === 0 ? 0 : (settled / total) * 100;

  const heading = isComplete
    ? failed > 0
      ? `Refreshed ${total - failed}/${total} — ${failed} failed`
      : `All ${total} tickers refreshed`
    : `Refreshing ${settled}/${total} tickers…`;

  return (
    <Snackbar
      open={open}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      // Auto-hide only once everything has settled; stay put while in progress.
      autoHideDuration={isComplete ? 4000 : null}
    >
      <Paper elevation={6} sx={{ p: 2, width: 320, maxWidth: "90vw" }}>
        <Typography variant="subtitle2" gutterBottom>
          {heading}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={percent}
          color={isComplete && failed > 0 ? "warning" : "primary"}
          sx={{ mb: 1.5, borderRadius: 1, height: 6 }}
        />
        <Box sx={{ maxHeight: 160, overflowY: "auto" }}>
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
            {symbols.map((symbol) => (
              <Chip
                key={symbol}
                size="small"
                variant="outlined"
                icon={STATUS_ICON[statuses[symbol] ?? "pending"]}
                label={symbol}
              />
            ))}
          </Stack>
        </Box>
      </Paper>
    </Snackbar>
  );
}
