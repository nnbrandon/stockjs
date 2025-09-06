import { useState, useEffect } from "react";
import Modal from "@mui/material/Modal";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CloseIcon from "@mui/icons-material/Close";
import FormControl from "@mui/material/FormControl";
import Autocomplete from "@mui/material/Autocomplete";
import isObject from "lodash/isObject";

import styles from "./AddTickerModal.module.css";
import tickers from "./sp500.json";
import TickerService from "../../TickerService";
import { getStoredSymbols } from "../../db";

function AddTickerModal({ onClose }) {
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
    } else {
      const storedSymbols = await getStoredSymbols();
      if (storedSymbols.includes(tickerInputValue)) {
        setError(`${tickerInputValue} is already added.`);
        setShowError(true);
        return;
      }

      let historicalData = [];
      // Calculate date range: 1 year from today
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 1);

      // Format as YYYY-MM-DD
      const formatDate = (date) => date.toISOString().slice(0, 10);
      try {
        historicalData = await TickerService.fetchHistoricalData(
          tickerInputValue,
          formatDate(startDate),
          formatDate(endDate)
        );
      } catch (error) {
        setError(
          `Error fetching data for ${tickerInputValue}: ${error.message}`
        );
        setShowError(true);
        return;
      }

      try {
        await TickerService.addToDB(historicalData);
      } catch (error) {
        setError(
          `Error storing data for ${tickerInputValue}: ${error.message}`
        );
        setShowError(true);
        return;
      }

      onClose();
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      aria-labelledby="Add Ticker"
      aria-describedby="Add a ticker"
    >
      <form className={styles.layout} onSubmit={handleSubmit}>
        <FormControl className={styles.controlLayout} fullWidth>
          <span className={styles.closeButton}>
            <CloseIcon alt="Close" onClick={onClose} fontSize="medium" />
          </span>
          <div className={styles.subredditInput}>
            <Autocomplete
              freeSolo
              disablePortal
              fullWidth
              id="ticker-symbol"
              options={tickerList}
              getOptionLabel={(option) => {
                if (isObject(option)) {
                  return `${option.Symbol} | ${option.Name}`;
                }

                return option;
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
                  helperText={error}
                  label="Enter a ticker symbol"
                  variant="outlined"
                  fullWidth
                />
              )}
            />
          </div>
          <div className={styles.addButton}>
            <Button type="submit" variant="contained" fullWidth>
              Add
            </Button>
          </div>
        </FormControl>
      </form>
    </Modal>
  );
}

export default AddTickerModal;
