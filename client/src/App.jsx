// App.js
import { useEffect, useState } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Button,
  Divider,
  Box,
  Typography,
  Tabs,
  Tab,
} from "@mui/material";
import { lightTheme, darkTheme } from "./theme";
import {
  addStockData,
  deleteSymbolData,
  getStockDataByDateRange,
  getStoredSymbols,
  saveFundamentals,
  getQuarterly,
  getAnnual,
  getAverageVolumePast30Days,
} from "./db";
import { last } from "lodash";
import CandlestickChart from "./components/CandlestickChart/CandlestickChart";
import CircularProgress from "@mui/material/CircularProgress";
import PatternTable from "./components/PatternTable/PatternTable";
import { analyzePatternsFromStockData } from "./utils/patternRecognizer";
import AddTickerModal from "./components/AddTickerModal/AddTickerModal";
import Navbar from "./components/Navbar/Navbar";
import MenuIcon from "@mui/icons-material/Menu";
import TimerangeSelector from "./components/TimerangeSelector/TimerangeSelector";
import DeleteIcon from "@mui/icons-material/Delete";
import styles from "./App.module.css";
import LambdaService from "./LambdaService";
import Stock52WeekRange from "./components/Stock52WeekRange/Stock52WeekRange";
import QuarterlyFundamentalsTable from "./components/QuarterlyFundamentalsTable/QuarterlyFundamentalsTable";
import AnnualFundamentalsTable from "./components/AnnualFundamentalsTable/AnnualFundamentalsTable";
import formatShortNumber from "./utils/formatShortNumber";

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

  const [averageVolumePast30Days, setAverageVolumePast30Days] = useState(null);

  const [quarterlyFundamentalsData, setQuarterlyFundamentalsData] =
    useState(null);
  const [annualFundamentalsData, setAnnualFundamentalsData] = useState(null);

  const [showAddTickerModal, setShowAddTickerModal] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

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

    getQuarterly(selectedSymbol, range.startDate, range.endDate).then(
      (data) => {
        setQuarterlyFundamentalsData(data);
      }
    );

    getAnnual(selectedSymbol, range.startDate, range.endDate).then((data) => {
      setAnnualFundamentalsData(data);
    });

    getAverageVolumePast30Days(selectedSymbol).then((data) => {
      setAverageVolumePast30Days(data);
    });
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

    try {
      const fundamentalsData = await LambdaService.fetchFundamentals(
        selectedSymbol,
        range.startDate,
        range.endDate
      );
      await saveFundamentals(selectedSymbol, fundamentalsData);
      setQuarterlyFundamentalsData(fundamentalsData.quarterlyResult);
      setAnnualFundamentalsData(fundamentalsData.annualResult);
    } catch (error) {
      console.error("Error fetching fundamentals data:", error);
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

        const fundamentalsData = await LambdaService.fetchFundamentals(
          symbol,
          range.startDate,
          range.endDate
        );
        await saveFundamentals(symbol, fundamentalsData);
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

  const renderQuarterlyFundamentalsTable = () => {
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
    } else if (
      !isChartLoading &&
      quarterlyFundamentalsData &&
      quarterlyFundamentalsData.length
    ) {
      return (
        <div
          style={{
            paddingRight: "6rem",
          }}
        >
          <h3>Quarterly Fundamentals</h3>
          <QuarterlyFundamentalsTable
            quarterlyFundamentalsData={quarterlyFundamentalsData}
          />
        </div>
      );
    } else {
      return <div />;
    }
  };

  const renderAnnualFundamentalsTable = () => {
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
    } else if (
      !isChartLoading &&
      annualFundamentalsData &&
      annualFundamentalsData.length
    ) {
      return (
        <div
          style={{
            paddingRight: "6rem",
          }}
        >
          <h3>Annual Fundamentals</h3>
          <AnnualFundamentalsTable
            annualFundamentalsData={annualFundamentalsData}
          />
        </div>
      );
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
        <div
          style={{
            paddingRight: "6rem",
          }}
        >
          <h3>Recognized Patterns</h3>
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
              {selectedSymbol && (
                <h2>
                  {chartData[0]?.name} ({chartData[0]?.symbol})
                </h2>
              )}
              {selectedSymbol && <h2>{last(chartData)?.close.toFixed(2)}</h2>}
              {selectedSymbol && <Stock52WeekRange symbol={selectedSymbol} />}
              {selectedSymbol && (
                <Box>
                  <Typography variant="h8">Average Volume (30 days)</Typography>
                  <Box display="flex" justifyContent="space-between">
                    {formatShortNumber(averageVolumePast30Days)}
                  </Box>
                </Box>
              )}
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
          {selectedSymbol && (
            <Box sx={{ width: "100%", mt: 2, ml: 2 }}>
              <Tabs
                value={activeTab}
                onChange={(_, newValue) => setActiveTab(newValue)}
                indicatorColor="primary"
                textColor="inherit"
                // variant="fullWidth"
                // centered
              >
                <Tab label="Quarterly Financials" />
                <Tab label="Annual Financials" />
                <Tab label="Recognized Patterns" />
              </Tabs>
              <Box sx={{ mt: 2 }}>
                {activeTab === 0 && renderQuarterlyFundamentalsTable()}
                {activeTab === 1 && renderAnnualFundamentalsTable()}
                {activeTab === 2 && renderPatternTable()}
              </Box>
            </Box>
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
