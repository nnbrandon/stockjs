import { useRef, useState } from "react";
import Modal from "@mui/material/Modal";
import CloseIcon from "@mui/icons-material/Close";
import UploadFileIcon from "@mui/icons-material/UploadFile";

import styles from "./ImportFidelityPortfolioModal.module.css";
import addTickerStyles from "../AddTickerModal/AddTickerModal.module.css";
import { importFidelityPortfolio } from "../../utils/importFidelityPortfolio";

const STEPS = [
  "Open Fidelity and go to your account",
  "Select the Positions tab",
  "Click the ⋮ menu in the top-right of the positions table",
  'Choose Download to export a CSV',
  "Upload or paste that file below",
];

function ImportFidelityPortfolioModal({ onClose }) {
  const fileInputRef = useRef(null);
  const [csvText, setCsvText] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleImport() {
    if (!csvText.trim()) {
      setError("Paste your Fidelity CSV or upload a file.");
      return;
    }

    setError("");
    setIsLoading(true);
    setProgress({ current: 0, total: 0, symbol: "", phase: "parsing" });

    try {
      const importResult = await importFidelityPortfolio(csvText, {
        onProgress: setProgress,
      });
      if (!importResult.imported.length) {
        setError("No equity positions found in this file.");
        return;
      }
      onClose({
        imported: importResult.imported.length,
        failed: importResult.failed.length,
        skipped: importResult.skipped.length,
      });
    } catch (err) {
      setError(err?.message ?? "Failed to import portfolio.");
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""));
      setError("");
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  const progressLabel =
    progress?.phase === "fetching"
      ? `Fetching ${progress.symbol} (${progress.current}/${progress.total})…`
      : progress?.phase === "saved"
        ? `Saving ${progress.symbol} (${progress.current}/${progress.total})…`
        : null;

  return (
    <Modal
      open
      onClose={() => !isLoading && onClose(null)}
      aria-labelledby="import-fidelity-title"
      slotProps={{ backdrop: { className: addTickerStyles.backdrop } }}
    >
      <div className={addTickerStyles.dialog}>
        <div className={addTickerStyles.header}>
          <div className={addTickerStyles.titleGroup}>
            <h2 id="import-fidelity-title" className={addTickerStyles.title}>
              Import Fidelity portfolio
            </h2>
            <p className={addTickerStyles.subtitle}>
              Adds holdings to your watchlist with quantity and average cost
              basis.
            </p>
          </div>
          <button
            type="button"
            className={addTickerStyles.closeBtn}
            onClick={() => onClose(null)}
            disabled={isLoading}
            aria-label="Close"
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <ol className={styles.steps}>
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <div className={styles.uploadRow}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className={styles.fileInput}
            onChange={handleFileChange}
          />
          <button
            type="button"
            className={styles.uploadBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            <UploadFileIcon fontSize="small" />
            Upload CSV
          </button>
        </div>

        <textarea
          className={styles.textarea}
          placeholder="Or paste CSV contents here…"
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setError("");
          }}
          disabled={isLoading}
          rows={8}
        />

        {progressLabel && (
          <p className={styles.progress}>{progressLabel}</p>
        )}

        <div className={addTickerStyles.errorText} role="alert">
          {error}
        </div>

        <div className={addTickerStyles.footer}>
          <button
            type="button"
            className={addTickerStyles.btnSecondary}
            onClick={() => onClose(null)}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={addTickerStyles.btnPrimary}
            onClick={handleImport}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className={addTickerStyles.spinner} aria-hidden />
                Importing…
              </>
            ) : (
              "Import"
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ImportFidelityPortfolioModal;
