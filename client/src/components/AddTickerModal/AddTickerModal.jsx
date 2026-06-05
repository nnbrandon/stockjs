import { useState, useEffect } from "react";
import Modal from "@mui/material/Modal";
import TextField from "@mui/material/TextField";
import CloseIcon from "@mui/icons-material/Close";
import Autocomplete from "@mui/material/Autocomplete";
import isObject from "lodash/isObject";

import styles from "./AddTickerModal.module.css";
import tickers from "./sp500.json";
import LambdaService from "../../LambdaService";
import {
  addStockData,
  getStoredSymbols,
  saveFundamentals,
  saveEarnings,
  saveNewsArticles,
} from "../../db";
import calculateRange from "../../utils/calculateRange";

const inputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "var(--palette-bg-elevated)",
    borderRadius: "var(--shape-radius-sm)",
    fontSize: 13.5,
    paddingTop: "4px",
    paddingBottom: "4px",
    transition: "border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)",
    "& fieldset": {
      borderColor: "var(--palette-divider)",
    },
    "&:hover fieldset": {
      borderColor: "var(--palette-divider-strong)",
    },
    "&.Mui-focused fieldset": {
      borderColor: "var(--palette-divider-strong)",
      borderWidth: "1px",
    },
    "&.Mui-error fieldset": {
      borderColor: "var(--palette-error)",
    },
    "& input": {
      color: "var(--palette-text-primary)",
      padding: "10px 4px",
    },
    "& input::placeholder": {
      color: "var(--palette-text-disabled)",
      opacity: 1,
    },
  },
  "& .MuiInputLabel-root": {
    color: "var(--palette-text-secondary)",
    fontSize: 13.5,
    "&.Mui-focused": { color: "var(--palette-text-secondary)" },
    "&.Mui-error": { color: "var(--palette-error)" },
  },
};

const popperSlotProps = {
  paper: {
    sx: {
      backgroundColor: "var(--palette-bg-elevated)",
      border: "1px solid var(--palette-divider)",
      borderRadius: "var(--shape-radius)",
      marginTop: "6px",
      boxShadow: "0 12px 32px -8px rgba(0, 0, 0, 0.5)",
      "& .MuiAutocomplete-listbox": {
        padding: "4px",
        maxHeight: 280,
      },
      "& .MuiAutocomplete-option": {
        borderRadius: "var(--shape-radius-sm)",
        padding: 0,
        minHeight: "auto",
        "&:hover, &.Mui-focused": {
          backgroundColor: "var(--palette-bg-hover)",
        },
        "&[aria-selected='true']": {
          backgroundColor: "var(--palette-bg-hover)",
        },
      },
      "& .MuiAutocomplete-noOptions": {
        color: "var(--palette-text-disabled)",
        fontSize: 12.5,
      },
    },
  },
};

function AddTickerModal({ onClose, range }) {
  const [isLoading, setIsLoading] = useState(false);
  const [tickerList, setTickerList] = useState([]);
  const [tickerInputValue, setTickerInputValue] = useState("");
  const [error, setError] = useState("");
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    setTickerList(tickers);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!tickerInputValue) {
      setError("A ticker symbol must be provided.");
      setShowError(true);
      return;
    }

    const storedSymbols = await getStoredSymbols();
    if (storedSymbols.includes(tickerInputValue)) {
      setError(`${tickerInputValue} is already added.`);
      setShowError(true);
      return;
    }

    setIsLoading(true);

    const ALL_RANGE = calculateRange(365 * 25);

    try {
      const [historicalData, fundamentalsData, news] = await Promise.all([
        LambdaService.fetchHistoricalData(
          tickerInputValue,
          ALL_RANGE.startDate,
          ALL_RANGE.endDate,
        ),
        LambdaService.fetchFundamentals(
          tickerInputValue,
          ALL_RANGE.startDate,
          ALL_RANGE.endDate,
        ),
        LambdaService.fetchNews(tickerInputValue),
      ]);

      await Promise.all([
        addStockData(historicalData),
        saveFundamentals(tickerInputValue, fundamentalsData),
        saveEarnings(tickerInputValue, fundamentalsData.earningsResult),
        saveNewsArticles(tickerInputValue, news),
      ]);

      setIsLoading(false);
      onClose(tickerInputValue);
    } catch (error) {
      setError(`Error adding ${tickerInputValue}: ${error.message}`);
      setShowError(true);
      setIsLoading(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={() => onClose(null)}
      aria-labelledby="add-ticker-title"
      aria-describedby="add-ticker-subtitle"
      slotProps={{ backdrop: { className: styles.backdrop } }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 id="add-ticker-title" className={styles.title}>
              Add ticker
            </h2>
            <p id="add-ticker-subtitle" className={styles.subtitle}>
              Search the S&amp;P 500 or enter a custom symbol.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => onClose(null)}
            aria-label="Close"
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <Autocomplete
              freeSolo
              disablePortal
              fullWidth
              autoHighlight
              id="ticker-symbol"
              options={tickerList}
              slotProps={popperSlotProps}
              getOptionLabel={(option) => {
                if (isObject(option)) {
                  return `${option.Symbol} | ${option.Name}`;
                }
                return option;
              }}
              renderOption={(props, option) => {
                const { key, ...rest } = props;
                if (!isObject(option)) {
                  return (
                    <li key={key} {...rest}>
                      <div className={styles.optionRow}>
                        <span className={styles.optionSymbol}>{option}</span>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={key} {...rest}>
                    <div className={styles.optionRow}>
                      <span className={styles.optionSymbol}>
                        {option.Symbol}
                      </span>
                      <span className={styles.optionName}>{option.Name}</span>
                    </div>
                  </li>
                );
              }}
              inputValue={tickerInputValue}
              onInputChange={(event, newInputValue) => {
                setError("");
                setShowError(false);
                if (!newInputValue) {
                  setTickerInputValue("");
                  return;
                }
                const symbol = newInputValue.split("|")[0].trim();
                setTickerInputValue(symbol);
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  error={showError}
                  placeholder="e.g. AAPL"
                  label="Ticker symbol"
                  variant="outlined"
                  fullWidth
                  sx={inputSx}
                  autoFocus
                />
              )}
            />
            <div className={styles.errorText} role="alert">
              {showError ? error : ""}
            </div>
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => onClose(null)}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className={styles.spinner} aria-hidden />
                  Adding…
                </>
              ) : (
                "Add"
              )}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export default AddTickerModal;
