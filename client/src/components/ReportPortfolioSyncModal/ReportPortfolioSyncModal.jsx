import { useState } from "react";
import Modal from "@mui/material/Modal";
import TextField from "@mui/material/TextField";
import CloseIcon from "@mui/icons-material/Close";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";

import addTickerStyles from "../AddTickerModal/AddTickerModal.module.css";
import {
  getLastReportSyncAt,
  getReportSyncEmail,
  getReportSyncToken,
  setReportSyncEmail,
  setReportSyncToken,
  syncReportPortfolio,
} from "../../utils/reportPortfolioSync";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [email, setEmail] = useState(getReportSyncEmail);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [lastSync, setLastSync] = useState(getLastReportSyncAt);
  const [isBusy, setIsBusy] = useState(false);

  async function handleSaveAndSync() {
    setError("");
    setStatus("");
    const trimmedToken = token.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedToken) {
      setError("Paste the sync token from setup-daily-report.sh.");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("Enter the email address the daily report should go to.");
      return;
    }
    if (positionCount === 0) {
      setError("Import your Fidelity portfolio first — nothing to sync yet.");
      return;
    }

    setIsBusy(true);
    setReportSyncToken(trimmedToken);
    setReportSyncEmail(trimmedEmail);
    try {
      const result = await syncReportPortfolio();
      if (!result.ok) {
        setError(result.error || "Sync failed — check the token and try again.");
        return;
      }
      setLastSync(getLastReportSyncAt());
      const synced = `Synced ${result.count} holding${result.count === 1 ? "" : "s"} for ${trimmedEmail}.`;
      if (result.emailVerified === false) {
        // First sync for this address: keep the modal open so the user sees
        // that AWS just sent them a verification link to click.
        setStatus(
          `${synced} Check your inbox for an "Amazon SES verification" email and click the link — reports can't be delivered until you do.`,
        );
        return;
      }
      setStatus(synced);
      onClose({ synced: result.count });
    } finally {
      setIsBusy(false);
    }
  }

  function handleClearToken() {
    setReportSyncToken("");
    setReportSyncEmail("");
    setToken("");
    setEmail("");
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
          The report is emailed to the address below (first-time addresses get
          an AWS verification link to click). Paste the{" "}
          <strong>SYNC_TOKEN</strong> printed when you ran{" "}
          <code>setup-daily-report.sh</code> in CloudShell. Treat it like a
          password — it only controls which symbols the email covers.
        </p>

        <div className={addTickerStyles.field}>
          <TextField
            fullWidth
            type="email"
            autoComplete="email"
            placeholder="Email the report goes to"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
              setStatus("");
            }}
            disabled={isBusy}
            sx={inputSx}
          />
        </div>

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
            disabled={isBusy || (!token && !email)}
          >
            Clear settings
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
