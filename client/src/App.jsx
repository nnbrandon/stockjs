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
import { addStockData, getStockDataBySymbol } from "./db";
import { last } from "lodash";
import CandlestickChart from "./components/CandlestickChart/CandlestickChart";
import CircularProgress from "@mui/material/CircularProgress";
import PatternTable from "./components/CandlestickChart/PatternTable/PatternTable";
import { analyzePatternsFromStockData } from "./utils/patternRecognizer";
import AddTickerModal from "./components/AddTickerModal/AddTickerModal";

const API_URL =
  "https://fwedwy4in5lnbkpm5yuczew6gm0vnfmj.lambda-url.us-east-1.on.aws/";
const symbol = "ORCL";
const startDate = "2025-01-01";
const endDate = "2025-09-06";

function App() {
  const [mode, setMode] = useState("dark");
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [patternTableData, setPatternTableData] = useState([]);

  const [showAddTickerModal, setShowAddTickerModal] = useState(false);

  const toggleTheme = () => {
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  };

  useEffect(() => {
    setIsChartLoading(true);
    getStockDataBySymbol(symbol)
      .then((data) => {
        if (data && data.length) {
          setChartData(data);
          const patterns = analyzePatternsFromStockData(data);
          console.log(patterns);
          setPatternTableData(patterns);
        }
      })
      .finally(() => setIsChartLoading(false));
  }, []);

  const refreshData = async () => {
    setIsChartLoading(true);
    try {
      const response = await fetch(
        `${API_URL}?symbol=${symbol}&start=${startDate}&end=${endDate}`
      );
      const data = await response.json();
      if (!response.ok) {
        console.error("Error fetching stock data:", data);
        setSnackbarMessage("Error refreshing data. Error: " + data.error);
      } else {
        const formattedData = data.map((item) => ({
          symbol: symbol,
          ...item,
        }));
        setChartData(formattedData);
        addStockData(formattedData);
        const patterns = analyzePatternsFromStockData(formattedData);
        setPatternTableData(patterns);
        console.log(formattedData);
        console.log(patterns);
        setSnackbarMessage("Data refreshed successfully!");
      }
    } catch (error) {
      console.error("Error fetching stock data:", error);
      setSnackbarMessage("Error refreshing data. Error: " + error.error);
    } finally {
      setIsChartLoading(false);
    }
  };

  const isUpToDate = () => {
    if (!chartData || !chartData.length) return true;

    // Check if today is a weekday (Monday to Friday)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Today is a weekend
      return false;
    }

    // Get today's date in YYYY-MM-DD format
    const todayFormatted = today.toISOString().split("T")[0];
    const lastEntryDate = new Date(last(chartData).date)
      .toISOString()
      .split("T")[0];

    // Check if the last entry's date matches today's date
    if (lastEntryDate !== todayFormatted) {
      return false;
    }

    // Check if the current time is after the stock market's closing time
    const marketCloseHour = 16; // 4:00 PM
    const marketCloseMinute = 0;
    const now = new Date();
    const marketCloseTime = new Date();
    marketCloseTime.setHours(marketCloseHour, marketCloseMinute, 0, 0);

    if (now < marketCloseTime) {
      // The market has not closed yet
      return false;
    }

    // All conditions are met: it's a weekday, the last entry is today's date, and the market has closed
    return true;
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
      {showAddTickerModal && (
        <AddTickerModal onClose={() => setShowAddTickerModal(false)} />
      )}
      <Button variant="outlined" onClick={toggleTheme}>
        Toggle {mode === "light" ? "Dark" : "Light"} Mode
      </Button>
      <Button variant="outlined" onClick={() => setShowAddTickerModal(true)}>
        Add Ticker
      </Button>
      <Tooltip
        title={
          !isUpToDate() ? "Data is up to date or market hasn't closed yet" : ""
        }
      >
        <span>
          <Button
            variant="outlined"
            onClick={refreshData}
            disabled={!isUpToDate()}
          >
            Refresh Data
          </Button>
        </span>
      </Tooltip>
      <Snackbar
        open={showSnackbar}
        autoHideDuration={6000}
        onClose={() => setShowSnackbar(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      ></Snackbar>

      <h1>{symbol}</h1>
      <h2>
        {startDate} to {endDate}
      </h2>
      <h3>Close: {last(chartData)?.close.toFixed(2)}</h3>
      {renderChart()}
      <Divider orientation="horizontal" />
      {renderPatternTable()}
    </ThemeProvider>
  );
}

export default App;
