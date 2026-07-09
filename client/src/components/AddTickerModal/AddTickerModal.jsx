import { useState } from "react";
import Modal from "@mui/material/Modal";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import CloseIcon from "@mui/icons-material/Close";
import Autocomplete from "@mui/material/Autocomplete";
import isObject from "lodash/isObject";

import styles from "./AddTickerModal.module.css";
import sp500 from "./sp500.json";
import useSymbolSearch from "../../hooks/useSymbolSearch";
import { isInWatchlist } from "../../db";
import { addSymbolToWatchlist } from "../../utils/addSymbolToWatchlist";

const SP500_OPTIONS = sp500.map(({ Symbol, Name }) => ({
  symbol: Symbol,
  name: Name,
}));

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

function AddTickerModal({ onClose }) {
  const [isLoading, setIsLoading] = useState(false);
  const [tickerInputValue, setTickerInputValue] = useState("");
  const [error, setError] = useState("");
  const [showError, setShowError] = useState(false);

  const query = tickerInputValue.trim();
  const { results: searchResults, isSearching } =
    useSymbolSearch(tickerInputValue);
  const options = query ? searchResults : SP500_OPTIONS;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!tickerInputValue) {
      setError("A ticker symbol must be provided.");
      setShowError(true);
      return;
    }

    if (await isInWatchlist(tickerInputValue)) {
      setError(`${tickerInputValue} is already added.`);
      setShowError(true);
      return;
    }

    setIsLoading(true);

    try {
      await addSymbolToWatchlist(tickerInputValue);
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
              Browse the S&amp;P 500 or search by symbol or company name.
            </p>
          </div>
          <IconButton
            className={styles.closeBtn}
            onClick={() => onClose(null)}
            aria-label="Close"
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <Autocomplete
              freeSolo
              disablePortal
              fullWidth
              autoHighlight
              id="ticker-symbol"
              options={options}
              loading={isSearching}
              filterOptions={(x) => x}
              slotProps={popperSlotProps}
              getOptionLabel={(option) => {
                if (isObject(option)) {
                  return `${option.symbol} | ${option.name}`;
                }
                return option;
              }}
              isOptionEqualToValue={(option, value) =>
                isObject(option) &&
                isObject(value) &&
                option.symbol === value.symbol
              }
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
                        {option.symbol}
                      </span>
                      <span className={styles.optionName}>{option.name}</span>
                    </div>
                  </li>
                );
              }}
              inputValue={tickerInputValue}
              onInputChange={(_, newInputValue) => {
                setError("");
                setShowError(false);
                if (!newInputValue) {
                  setTickerInputValue("");
                  return;
                }
                const symbol = newInputValue.split("|")[0].trim();
                setTickerInputValue(symbol);
              }}
              onChange={(_, newValue) => {
                if (!newValue) return;
                const symbol = isObject(newValue)
                  ? newValue.symbol
                  : newValue.trim();
                if (symbol) setTickerInputValue(symbol);
              }}
              noOptionsText="No matches found"
              renderInput={(params) => (
                <TextField
                  {...params}
                  error={showError}
                  placeholder="e.g. AAPL or Apple"
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
            <Button
              type="button"
              variant="outlined"
              onClick={() => onClose(null)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isLoading}
              startIcon={
                isLoading ? (
                  <CircularProgress size={12} color="inherit" thickness={5} />
                ) : null
              }
            >
              {isLoading ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export default AddTickerModal;
