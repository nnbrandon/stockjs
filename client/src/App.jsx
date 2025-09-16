// App.js
import React, { useEffect, useState } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Button,
  Snackbar,
  Tooltip,
  Divider,
} from "@mui/material";
import { lightTheme, darkTheme } from "./theme";
import { addStockData, getStockDataByDateRange, getStoredSymbols } from "./db";
import { last } from "lodash";
import CandlestickChart from "./components/CandlestickChart/CandlestickChart";
import CircularProgress from "@mui/material/CircularProgress";
import PatternTable from "./components/CandlestickChart/PatternTable/PatternTable";
import { analyzePatternsFromStockData } from "./utils/patternRecognizer";
import AddTickerModal from "./components/AddTickerModal/AddTickerModal";
import Navbar from "./components/Navbar/Navbar";
import MenuIcon from "@mui/icons-material/Menu";
import TimerangeSelector from "./components/TimerangeSelector/TimerangeSelector";

import styles from "./App.module.css";
import TickerService from "./TickerService";

function App() {
  const [mode, setMode] = useState("dark");
  const [showNavBar, setShowNavBar] = useState(true);

  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [patternTableData, setPatternTableData] = useState([]);

  const [range, setRange] = useState();
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [storedSymbols, setStoredSymbols] = useState([]);

  const [showAddTickerModal, setShowAddTickerModal] = useState(false);

  const toggleTheme = () => {
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  };

  const fetchStoredSymbols = async () => {
    const symbols = await getStoredSymbols();
    setStoredSymbols(symbols);
  };

  useEffect(() => {
    // Get stored symbols from IndexedDB
    fetchStoredSymbols();
  }, []);

  useEffect(() => {
    if (!selectedSymbol || !range) return;

    setIsChartLoading(true);
    // Fetch stock data from IndexedDB
    getStockDataByDateRange(selectedSymbol, range.startDate, range.endDate)
      .then((data) => {
        if (data && data.length) {
          setChartData(data);
          const patterns = analyzePatternsFromStockData(data);
          setPatternTableData(patterns);
        }
      })
      .finally(() => setIsChartLoading(false));
  }, [selectedSymbol, range]);

  const refreshData = async () => {
    setIsChartLoading(true);
    debugger;
    try {
      const historicalData = await TickerService.fetchHistoricalData(
        selectedSymbol,
        range.startDate,
        range.endDate
      );
      await TickerService.addToDB(historicalData);
      setChartData(historicalData);
      addStockData(historicalData);
      const patterns = analyzePatternsFromStockData(historicalData);
      setPatternTableData(patterns);
      setSnackbarMessage("Data refreshed successfully!");
    } catch (error) {
      console.error("Error fetching stock data:", error);
      setSnackbarMessage("Error refreshing data. Error: " + error.error);
    } finally {
      setIsChartLoading(false);
    }
  };

  const renderChart = () => {
    if (isChartLoading) {
      return <CircularProgress />;
    } else if (!isChartLoading && chartData && chartData.length) {
      return <CandlestickChart chartData={chartData} />;
    } else {
      return <div />;
    }
  };

  const renderPatternTable = () => {
    if (isChartLoading) {
      return <CircularProgress />;
    } else if (!isChartLoading && chartData && chartData.length) {
      return <PatternTable patternsData={patternTableData} />;
    } else {
      return <div />;
    }
  };

  return (
    <ThemeProvider theme={mode === "light" ? lightTheme : darkTheme}>
      {/* CssBaseline normalizes styles */}
      <CssBaseline />

      <div className={styles.container}>
        {showNavBar && (
          <Navbar
            mode={mode}
            toggleTheme={toggleTheme}
            symbols={storedSymbols}
            selectedSymbol={selectedSymbol}
            onCloseNav={() => setShowNavBar(false)}
            onClickAddTickerModal={() => setShowAddTickerModal(true)}
            onClickSymbol={setSelectedSymbol}
          />
        )}
        {!showNavBar && (
          <MenuIcon
            className={styles.hamburgerButton}
            alt="menu"
            onClick={() => setShowNavBar(true)}
            fontSize="large"
          />
        )}
        {showNavBar && <Divider orientation="vertical" />}

        {showAddTickerModal && (
          <AddTickerModal
            range={range}
            onClose={(tickerInputValue) => {
              setShowAddTickerModal(false);
              if (tickerInputValue) {
                // If a ticker was added, refetch the stored symbols
                fetchStoredSymbols();
                setSelectedSymbol(tickerInputValue);
              }
            }}
          />
        )}

        <Snackbar
          open={showSnackbar}
          autoHideDuration={6000}
          onClose={() => setShowSnackbar(false)}
          message={snackbarMessage}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        ></Snackbar>

        <div className={styles.view}>
          <h1>{selectedSymbol}</h1>
          <h2>
            {range?.startDate} to {range?.endDate}
          </h2>
          <TimerangeSelector onChange={(range) => setRange(range)} />
          <h3>Close: {last(chartData)?.close.toFixed(2)}</h3>
          <Button variant="outlined" onClick={refreshData}>
            Refresh Data
          </Button>
          {renderChart()}
          <Divider orientation="horizontal" />
          {renderPatternTable()}
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
