import { useState } from "react";
import Modal from "@mui/material/Modal";
import TextField from "@mui/material/TextField";
import CloseIcon from "@mui/icons-material/Close";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";

import addTickerStyles from "../AddTickerModal/AddTickerModal.module.css";
import {
  getLastReportSyncAt,
  getReportSyncToken,
  setReportSyncToken,
  syncReportPortfolio,
} from "../../utils/reportPortfolioSync";

const inputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "var(--palette-bg-elevated)",
    borderRadius: "var(--shape-radius-sm)",
    fontSize: 13.5,
    "& fieldset": { borderColor: "var(--palette-divider)" },
    "&:hover fieldset": { borderColor: "var(--palette-divider-strong)" },
    "&.Mui-focused fieldset": {
      borderColor: "var(--palette-divider-strong)",
      borderWidth: "1px",
    },
    "& input": { color: "var(--palette-text-primary)", padding: "10px 12px" },
  },
};

function formatSyncTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

function ReportPortfolioSyncModal({ positionCount, onClose }) {
  const [token, setToken] = useState(getReportSyncToken);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [lastSync, setLastSync] = useState(getLastReportSyncAt);
  const [isBusy, setIsBusy] = useState(false);

  async function handleSaveAndSync() {
    setError("");
    setStatus("");
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Paste the sync token from setup-daily-report.sh.");
      return;
    }
    if (positionCount === 0) {
      setError("Import your Fidelity portfolio first — nothing to sync yet.");
      return;
    }

    setIsBusy(true);
    setReportSyncToken(trimmed);
    try {
      const result = await syncReportPortfolio();
      if (!result.ok) {
        setError(result.error || "Sync failed — check the token and try again.");
        return;
      }
      setLastSync(getLastReportSyncAt());
      setStatus(`Synced ${result.count} holding${result.count === 1 ? "" : "s"} to the daily email.`);
      onClose({ synced: result.count });
    } finally {
      setIsBusy(false);
    }
  }

  function handleClearToken() {
    setReportSyncToken("");
    setToken("");
    setStatus("");
    setError("");
  }

  const lastSyncLabel = formatSyncTime(lastSync);

  return (
    <Modal
      open
      onClose={() => !isBusy && onClose(null)}
      aria-labelledby="report-sync-title"
      slotProps={{ backdrop: { className: addTickerStyles.backdrop } }}
    >
      <div className={addTickerStyles.dialog}>
        <div className={addTickerStyles.header}>
          <div className={addTickerStyles.titleGroup}>
            <h2 id="report-sync-title" className={addTickerStyles.title}>
              Sync email report
            </h2>
            <p className={addTickerStyles.subtitle}>
              Keeps the 9 AM daily digest aligned with your imported holdings.
              After you save a token, holdings sync automatically on each
              Fidelity import — or use Sync now anytime.
            </p>
          </div>
          <button
            type="button"
            className={addTickerStyles.closeBtn}
            onClick={() => onClose(null)}
            disabled={isBusy}
            aria-label="Close"
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <p className={addTickerStyles.subtitle} style={{ marginBottom: 12 }}>
          Paste the <strong>SYNC_TOKEN</strong> printed when you ran{" "}
          <code>setup-daily-report.sh</code> in CloudShell. Treat it like a
          password — it only controls which symbols the email covers.
        </p>

        <div className={addTickerStyles.field}>
          <TextField
            fullWidth
            type="password"
            autoComplete="off"
            placeholder="Sync token"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setError("");
              setStatus("");
            }}
            disabled={isBusy}
            sx={inputSx}
          />
        </div>

        {lastSyncLabel && (
          <p className={addTickerStyles.subtitle}>Last synced: {lastSyncLabel}</p>
        )}

        {status && (
          <p className={addTickerStyles.subtitle} role="status">
            {status}
          </p>
        )}

        <div className={addTickerStyles.errorText} role="alert">
          {error}
        </div>

        <div className={addTickerStyles.footer}>
          <button
            type="button"
            className={addTickerStyles.btnSecondary}
            onClick={handleClearToken}
            disabled={isBusy || !token}
          >
            Clear token
          </button>
          <button
            type="button"
            className={addTickerStyles.btnPrimary}
            onClick={handleSaveAndSync}
            disabled={isBusy || positionCount === 0}
          >
            {isBusy ? (
              <>
                <span className={addTickerStyles.spinner} aria-hidden />
                Syncing…
              </>
            ) : (
              <>
                <EmailOutlinedIcon fontSize="small" />
                Save &amp; sync now
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ReportPortfolioSyncModal;
