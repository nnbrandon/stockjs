import { useState, useEffect } from "react";
import Modal from "@mui/material/Modal";
import Box from "@mui/material/Box";
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
import { set } from "lodash";

const boxStyle = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 400,
  bgcolor: "background.paper",
  border: "2px solid #000",
  boxShadow: 24,
  p: 4,
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
    } else {
      const storedSymbols = await getStoredSymbols();
      if (storedSymbols.includes(tickerInputValue)) {
        setError(`${tickerInputValue} is already added.`);
        setShowError(true);
        return;
      }

      setIsLoading(true);
      let historicalData = [];
      try {
        historicalData = await TickerService.fetchHistoricalData(
          tickerInputValue,
          range.startDate,
          range.endDate
        );
      } catch (error) {
        setError(
          `Error fetching data for ${tickerInputValue}: ${error.message}`
        );
        setShowError(true);
        setIsLoading(false);
        return;
      }

      try {
        await TickerService.addToDB(historicalData);
      } catch (error) {
        setError(
          `Error storing data for ${tickerInputValue}: ${error.message}`
        );
        setShowError(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      onClose(tickerInputValue);
    }
  }

  return (
    <Modal
      open={true}
      onClose={() => onClose(null)}
      aria-labelledby="Add Ticker"
      aria-describedby="Add a ticker"
    >
      <Box sx={boxStyle}>
        <form onSubmit={handleSubmit}>
          <FormControl className={styles.controlLayout} fullWidth>
            <span className={styles.closeButton}>
              <CloseIcon
                alt="Close"
                onClick={() => onClose(null)}
                fontSize="medium"
                style={{ cursor: "pointer" }}
              />
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
              {isLoading ? (
                <Button variant="contained" disabled fullWidth>
                  Loading...
                </Button>
              ) : null}
              {!isLoading ? (
                <Button type="submit" variant="contained" fullWidth>
                  Add
                </Button>
              ) : null}
            </div>
          </FormControl>
        </form>
      </Box>
    </Modal>
  );
}

export default AddTickerModal;
