// App.js
import React, { useEffect, useState } from "react";
import { ThemeProvider, CssBaseline, Button, Divider } from "@mui/material";
import { lightTheme, darkTheme } from "./theme";
import {
  addStockData,
  deleteSymbolData,
  getStockDataByDateRange,
  getStoredSymbols,
} from "./db";
import { last } from "lodash";
import CandlestickChart from "./components/CandlestickChart/CandlestickChart";
import CircularProgress from "@mui/material/CircularProgress";
import PatternTable from "./components/CandlestickChart/PatternTable/PatternTable";
import { analyzePatternsFromStockData } from "./utils/patternRecognizer";
import AddTickerModal from "./components/AddTickerModal/AddTickerModal";
import Navbar from "./components/Navbar/Navbar";
import MenuIcon from "@mui/icons-material/Menu";
import TimerangeSelector from "./components/TimerangeSelector/TimerangeSelector";
import DeleteIcon from "@mui/icons-material/Delete";
import styles from "./App.module.css";
import LambdaService from "./LambdaService";
import Stock52WeekRange from "./components/Stock52WeekRange/Stock52WeekRange";

function App() {
  const [mode, setMode] = useState("dark");
  const [showNavBar, setShowNavBar] = useState(true);

  const [isChartLoading, setIsChartLoading] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
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
    try {
      const historicalData = await LambdaService.fetchHistoricalData(
        selectedSymbol,
        range.startDate,
        range.endDate
      );
      await addStockData(historicalData); // Update IndexedDB
      setChartData(historicalData);
      addStockData(historicalData);
      const patterns = analyzePatternsFromStockData(historicalData);
      setPatternTableData(patterns);
    } catch (error) {
      console.error("Error fetching stock data:", error);
    } finally {
      setIsChartLoading(false);
    }
  };

  const refreshAllTickers = async () => {
    setIsChartLoading(true);
    setIsRefreshingAll(true);
    try {
      const promises = storedSymbols.map(async (symbol) => {
        const historicalData = await LambdaService.fetchHistoricalData(
          symbol,
          range.startDate,
          range.endDate
        );
        await addStockData(historicalData);

        if (symbol === selectedSymbol) {
          setChartData(historicalData);
          const patterns = analyzePatternsFromStockData(historicalData);
          setPatternTableData(patterns);
        }
      });

      await Promise.allSettled(promises);
    } catch (error) {
      console.error("Error refreshing all tickers:", error);
    } finally {
      setIsChartLoading(false);
      setIsRefreshingAll(false);
    }
  };

  const renderChart = () => {
    if (isChartLoading) {
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 200,
          }}
        >
          <CircularProgress />
        </div>
      );
    } else if (!isChartLoading && chartData && chartData.length) {
      return <CandlestickChart chartData={chartData} />;
    } else {
      return <div />;
    }
  };

  const renderPatternTable = () => {
    if (isChartLoading) {
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 200,
          }}
        >
          <CircularProgress />
        </div>
      );
    } else if (!isChartLoading && chartData && chartData.length) {
      return (
        <div style={{ padding: "3rem", marginRight: "3rem" }}>
          <PatternTable patternsData={patternTableData} />
        </div>
      );
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
            onRefreshAllTickers={refreshAllTickers}
            isRefreshingAll={isRefreshingAll}
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

        <div className={styles.view}>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              padding: "0.5rem",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              {selectedSymbol && <h2>{selectedSymbol}</h2>}
              {selectedSymbol && <h2>{last(chartData)?.close.toFixed(2)}</h2>}
              {selectedSymbol && <Stock52WeekRange symbol={selectedSymbol} />}
              <TimerangeSelector onChange={(range) => setRange(range)} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <Button
                variant="outlined"
                onClick={refreshData}
                disabled={!selectedSymbol}
              >
                Refresh Data
              </Button>
              <Button
                variant="outlined"
                color="error" // red color for delete
                onClick={() => {
                  deleteSymbolData(selectedSymbol).then(() => {
                    setSelectedSymbol(null);
                    fetchStoredSymbols();
                  });
                }}
                disabled={!selectedSymbol}
                aria-label="delete"
              >
                Delete
                <DeleteIcon />
              </Button>
            </div>
          </div>
          {selectedSymbol && renderChart()}
          {selectedSymbol && renderPatternTable()}
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
