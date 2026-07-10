import { useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import SearchIcon from "@mui/icons-material/Search";
import InputAdornment from "@mui/material/InputAdornment";
import isObject from "lodash/isObject";

import useSymbolSearch from "../../hooks/useSymbolSearch";
import normalizeSymbol from "../../utils/normalizeSymbol";
import sp500 from "../AddTickerModal/sp500.json";
import styles from "./SymbolSearch.module.css";

// Shown as a browse list before the user types anything; a real search call
// takes over once there's input.
const SP500_OPTIONS = sp500.map(({ Symbol, Name }) => ({
  symbol: Symbol,
  name: Name,
}));

// Browse-first search: pick a result → navigate to its detail page. Does NOT
// add to the watchlist (that's the detail page's Add button / AddTickerModal).
const inputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "var(--palette-bg-elevated)",
    borderRadius: "var(--shape-radius-sm)",
    fontSize: 13,
    paddingTop: "2px",
    paddingBottom: "2px",
    "& fieldset": { borderColor: "var(--palette-divider)" },
    "&:hover fieldset": { borderColor: "var(--palette-divider-strong)" },
    "&.Mui-focused fieldset": {
      borderColor: "var(--palette-divider-strong)",
      borderWidth: "1px",
    },
    "& input": {
      color: "var(--palette-text-primary)",
      padding: "6px 4px",
    },
    "& input::placeholder": {
      color: "var(--palette-text-disabled)",
      opacity: 1,
    },
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
      "& .MuiAutocomplete-listbox": { padding: "4px", maxHeight: 280 },
      "& .MuiAutocomplete-option": {
        borderRadius: "var(--shape-radius-sm)",
        padding: 0,
        minHeight: 40,
        "&:hover, &.Mui-focused": {
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

export default function SymbolSearch({ onSelectSymbol, placeholder = "Search any stock…" }) {
  const [inputValue, setInputValue] = useState("");
  const { results, isSearching } = useSymbolSearch(inputValue);

  const go = (symbol) => {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) return;
    onSelectSymbol(normalized);
    setInputValue("");
  };

  return (
    <Autocomplete
      freeSolo
      fullWidth
      autoHighlight
      openOnFocus
      options={inputValue.trim() ? results : SP500_OPTIONS}
      loading={isSearching}
      filterOptions={(x) => x}
      slotProps={popperSlotProps}
      getOptionLabel={(option) =>
        isObject(option) ? `${option.symbol} | ${option.name}` : option
      }
      isOptionEqualToValue={(option, value) =>
        isObject(option) && isObject(value) && option.symbol === value.symbol
      }
      inputValue={inputValue}
      onInputChange={(_, value, reason) => {
        if (reason === "reset") return;
        setInputValue(value);
      }}
      onChange={(_, value) => {
        if (!value) return;
        go(isObject(value) ? value.symbol : value);
      }}
      renderOption={(props, option) => {
        const { key, ...rest } = props;
        return (
          <li key={key} {...rest}>
            <div className={styles.optionRow}>
              <span className={styles.optionSymbol}>{option.symbol}</span>
              <span className={styles.optionName}>{option.name}</span>
            </div>
          </li>
        );
      }}
      noOptionsText={inputValue.trim() ? "No matches found" : "Type a symbol or company"}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          variant="outlined"
          sx={inputSx}
          slotProps={{
            input: {
              ...params.InputProps,
              startAdornment: (
                <InputAdornment position="start" sx={{ ml: 0.5, mr: -0.25 }}>
                  <SearchIcon
                    sx={{ fontSize: 17, color: "var(--palette-text-disabled)" }}
                  />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
    />
  );
}
