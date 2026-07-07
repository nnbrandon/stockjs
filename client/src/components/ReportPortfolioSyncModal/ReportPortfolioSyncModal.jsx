import { useState } from "react";
import Modal from "@mui/material/Modal";
import TextField from "@mui/material/TextField";
import CloseIcon from "@mui/icons-material/Close";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";

import addTickerStyles from "../AddTickerModal/AddTickerModal.module.css";
import LambdaService from "../../LambdaService";
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
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("Enter the email address the daily report should go to.");
      return;
    }
    if (!trimmedToken) {
      setError('Paste your sync token — tap "Email me a sync token" to get one.');
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

  async function handleRequestToken() {
    setError("");
    setStatus("");
    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("Enter your email address first.");
      return;
    }

    setIsBusy(true);
    setReportSyncEmail(trimmedEmail);
    try {
      const result = await LambdaService.requestSyncToken(trimmedEmail);
      if (!result.ok) {
        setError(result.error || "Could not send the token — try again.");
        return;
      }
      if (result.verificationSent) {
        setStatus(
          `AWS sent a verification email to ${trimmedEmail} — click its link, then tap "Email me a sync token" again.`,
        );
        return;
      }
      setStatus(
        `Sync token sent to ${trimmedEmail} — check your inbox and paste it below.`,
      );
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
          <strong>Step 1:</strong> enter the email the report should go to and
          tap <em>Email me a sync token</em>. First-time addresses get an AWS
          verification link to click first. <strong>Step 2:</strong> paste the
          token from your inbox below. Treat it like a password — it controls
          which symbols your email covers.
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

        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={addTickerStyles.btnSecondary}
            onClick={handleRequestToken}
            disabled={isBusy || !email.trim()}
          >
            <EmailOutlinedIcon fontSize="small" />
            Email me a sync token
          </button>
        </div>

        <div className={addTickerStyles.field}>
          <TextField
            fullWidth
            type="password"
            autoComplete="off"
            placeholder="Sync token (from the email)"
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
