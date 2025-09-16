// App.js
import React, { useEffect, useState } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Button,
  Divider,
  Tooltip,
} from "@mui/material";
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
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import styles from "./App.module.css";
import LambdaService from "./LambdaService";

function App() {
  const [mode, setMode] = useState("dark");
  const [showNavBar, setShowNavBar] = useState(true);

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
        <div style={{ padding: "1rem" }}>
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
          {selectedSymbol ? (
            <>
              <div
                style={{
                  display: "flex",
                  gap: "1rem",
                  padding: "0.5rem",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "1rem" }}
                >
                  <h2>{selectedSymbol}</h2>
                  <h2>${last(chartData)?.close.toFixed(2)}</h2>
                  <Button variant="outlined" onClick={refreshData}>
                    Refresh Data
                  </Button>
                  <TimerangeSelector onChange={(range) => setRange(range)} />
                  {range && (
                    <h2>
                      {new Date(range?.startDate).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}{" "}
                      to{" "}
                      {new Date(range?.endDate).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </h2>
                  )}
                </div>

                <div
                  style={{ display: "flex", alignItems: "center", gap: "1rem" }}
                >
                  <Tooltip title="Delete all data for this symbol">
                    <IconButton
                      color="error" // red color for delete
                      onClick={() => {
                        deleteSymbolData(selectedSymbol).then(() => {
                          setSelectedSymbol(null);
                          fetchStoredSymbols();
                        });
                      }}
                      aria-label="delete"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
              {renderChart()}
              {renderPatternTable()}
            </>
          ) : (
            <>
              <h2>Welcome to stockjs</h2>
              <p>
                To get started, click "Add Ticker" to add a stock ticker symbol.
              </p>
            </>
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
