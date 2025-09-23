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
  getStoredSymbolsWithNames,
  saveFundamentals,
  getQuarterly,
  getAnnual,
  getAverageVolumePast30Days,
  getNewsBySymbol,
  saveNewsArticles,
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
import { SnackbarProvider, useSnackbar } from "./components/SnackbarProvider";
import { ModeProvider, useMode } from "./components/ModeProvider";
import NewsList from "./components/NewsList/NewsList";

function App() {
  const { mode, toggleTheme } = useMode();
  const [showNavBar, setShowNavBar] = useState(true);

  const [isChartLoading, setIsChartLoading] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [patternTableData, setPatternTableData] = useState([]);

  const [range, setRange] = useState();
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [storedSymbolsWithNames, setStoredSymbolsWithNames] = useState([]);

  const [averageVolumePast30Days, setAverageVolumePast30Days] = useState(null);

  const [quarterlyFundamentalsData, setQuarterlyFundamentalsData] =
    useState(null);
  const [annualFundamentalsData, setAnnualFundamentalsData] = useState(null);

  const [showAddTickerModal, setShowAddTickerModal] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const [news, setNews] = useState([]);

  const showSnackbar = useSnackbar();

  const fetchStoredSymbols = async () => {
    const symbolsWithNames = await getStoredSymbolsWithNames();
    setStoredSymbolsWithNames(symbolsWithNames);
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

    getNewsBySymbol(selectedSymbol).then((data) => {
      setNews(data);
    });
  }, [selectedSymbol, range]);

  const refreshData = async () => {
    setIsRefreshingData(true);
    try {
      // Run all fetches in parallel
      const [historicalData, fundamentalsData, newsData] = await Promise.all([
        LambdaService.fetchHistoricalData(
          selectedSymbol,
          range.startDate,
          range.endDate
        ),
        LambdaService.fetchFundamentals(
          selectedSymbol,
          range.startDate,
          range.endDate
        ),
        LambdaService.fetchNews(selectedSymbol),
      ]);

      await Promise.all([
        addStockData(historicalData),
        saveFundamentals(selectedSymbol, fundamentalsData),
        saveNewsArticles(selectedSymbol, newsData),
      ]);

      setChartData(historicalData);
      setPatternTableData(analyzePatternsFromStockData(historicalData));
      setQuarterlyFundamentalsData(fundamentalsData.quarterlyResult);
      setAnnualFundamentalsData(fundamentalsData.annualResult);
      setNews(newsData);

      showSnackbar("Data refreshed!", "success");
    } catch (error) {
      console.error("Error fetching stock data:", error);
      showSnackbar("Error refreshing data", "error");
    } finally {
      setIsRefreshingData(false);
    }
  };

  const refreshAllTickers = async () => {
    setIsChartLoading(true);
    setIsRefreshingAll(true);
    try {
      // Run all tickers in parallel
      const promises = storedSymbolsWithNames.map(async (symbol) => {
        // Fetch all data for this symbol in parallel
        const [historicalData, fundamentalsData, newsData] = await Promise.all([
          LambdaService.fetchHistoricalData(
            symbol.symbol,
            range.startDate,
            range.endDate
          ),
          LambdaService.fetchFundamentals(
            symbol.symbol,
            range.startDate,
            range.endDate
          ),
          LambdaService.fetchNews(symbol.symbol),
        ]);

        await Promise.all([
          addStockData(historicalData),
          saveFundamentals(symbol.symbol, fundamentalsData),
          saveNewsArticles(symbol.symbol, newsData),
        ]);

        // Update UI for selected symbol only
        if (symbol.symbol === selectedSymbol) {
          setChartData(historicalData);
          const patterns = analyzePatternsFromStockData(historicalData);
          setPatternTableData(patterns);
          setQuarterlyFundamentalsData(fundamentalsData.quarterlyResult);
          setAnnualFundamentalsData(fundamentalsData.annualResult);
          setNews(newsData);
        }
      });

      await Promise.allSettled(promises);
      showSnackbar("All tickers refreshed!", "success");
    } catch (error) {
      console.error("Error refreshing all tickers:", error.message);
      showSnackbar("Error refreshing all tickers", "error");
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
            storedSymbolsWithNames={storedSymbolsWithNames}
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
              flexDirection: "column",
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
              {isRefreshingData ? (
                <Button disabled variant="outlined">
                  Refreshing...
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  onClick={refreshData}
                  disabled={!selectedSymbol}
                >
                  Refresh Data
                </Button>
              )}
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
            <Box sx={{ width: "100%", mt: 2, ml: 2, mb: 2 }}>
              <Tabs
                value={activeTab}
                onChange={(_, newValue) => setActiveTab(newValue)}
                indicatorColor="primary"
                textColor="inherit"
              >
                <Tab label="News" />
                <Tab label="Quarterly Financials" />
                <Tab label="Annual Financials" />
                <Tab label="Recognized Patterns" />
              </Tabs>
              <Box sx={{ mt: 2 }}>
                {activeTab === 0 && <NewsList news={news} />}
                {activeTab === 1 && renderQuarterlyFundamentalsTable()}
                {activeTab === 2 && renderAnnualFundamentalsTable()}
                {activeTab === 3 && renderPatternTable()}
              </Box>
            </Box>
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}

// Wrap your App export:
export default function WrappedApp(props) {
  return (
    <ModeProvider>
      <SnackbarProvider>
        <App {...props} />
      </SnackbarProvider>
    </ModeProvider>
  );
}
