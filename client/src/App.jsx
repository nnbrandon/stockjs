// App.js
import { useState } from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { lightTheme, darkTheme } from "./theme";
import { deleteSymbolData } from "./db";
import useStoredSymbols from "./hooks/useStoredSymbols";
import useSymbolData from "./hooks/useSymbolData";
import useRefreshData from "./hooks/useRefreshData";
import CandlestickChart from "./components/CandlestickChart/CandlestickChart";
import ChartSkeleton from "./components/CandlestickChart/ChartSkeleton";
import AddTickerModal from "./components/AddTickerModal/AddTickerModal";
import Navbar from "./components/Navbar/Navbar";
import NavbarMini from "./components/Navbar/NavbarMini";
import StockHeader from "./components/StockHeader/StockHeader";
import StockActions from "./components/StockActions/StockActions";
import StatRow from "./components/StatRow/StatRow";
import StockTabs from "./components/StockTabs/StockTabs";
import TimerangeSelector from "./components/TimerangeSelector/TimerangeSelector";
import TrendingStocks from "./components/TrendingStocks/TrendingStocks";
import styles from "./App.module.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "./components/SnackbarProvider";
import { ModeProvider, useMode } from "./components/ModeProvider";
import { queryClient } from "./queryClient";

function App() {
  const { mode, toggleTheme } = useMode();
  const [showNavBar, setShowNavBar] = useState(true);
  const [showAddTickerModal, setShowAddTickerModal] = useState(false);

  const [range, setRange] = useState();
  const [selectedSymbol, setSelectedSymbol] = useState(null);

  const { storedSymbolsWithNames, refresh: refreshStoredSymbols } =
    useStoredSymbols();

  const symbolData = useSymbolData(selectedSymbol, range);

  const { refreshSymbol, refreshAll, isRefreshingData, isRefreshingAll } =
    useRefreshData({
      selectedSymbol,
      range,
      storedSymbolsWithNames,
      applyRefresh: symbolData.applyRefresh,
    });

  const isChartLoading = symbolData.isLoading || isRefreshingAll;
  const hasChartData = symbolData.chartData && symbolData.chartData.length > 0;

  const handleDelete = () => {
    deleteSymbolData(selectedSymbol).then(() => {
      setSelectedSymbol(null);
      refreshStoredSymbols();
    });
  };

  const handleAddTickerClose = (tickerInputValue) => {
    setShowAddTickerModal(false);
    if (tickerInputValue) {
      refreshStoredSymbols();
      setSelectedSymbol(tickerInputValue);
    }
  };

  return (
    <ThemeProvider theme={mode === "light" ? lightTheme : darkTheme}>
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
            onClickHome={() => setSelectedSymbol(null)}
            onRefreshAllTickers={refreshAll}
            isRefreshingAll={isRefreshingAll}
          />
        )}
        {!showNavBar && (
          <NavbarMini
            storedSymbolsWithNames={storedSymbolsWithNames}
            selectedSymbol={selectedSymbol}
            onExpandNav={() => setShowNavBar(true)}
            onClickAddTickerModal={() => setShowAddTickerModal(true)}
            onClickSymbol={setSelectedSymbol}
            onClickHome={() => setSelectedSymbol(null)}
            onRefreshAllTickers={refreshAll}
            isRefreshingAll={isRefreshingAll}
          />
        )}

        {showAddTickerModal && (
          <AddTickerModal range={range} onClose={handleAddTickerClose} />
        )}

        <div className={styles.view}>
          <StockHeader
            selectedSymbol={selectedSymbol}
            chartData={symbolData.chartData}
          >
            <StockActions
              selectedSymbol={selectedSymbol}
              isRefreshingData={isRefreshingData}
              onRefresh={refreshSymbol}
              onDelete={handleDelete}
            />
          </StockHeader>

          <StatRow
            symbol={selectedSymbol}
            chartData={symbolData.chartData}
            averageVolumePast30Days={symbolData.averageVolumePast30Days}
            isLoading={isChartLoading}
          />

          {selectedSymbol && (
            <div className={styles.chartControls}>
              <TimerangeSelector onChange={setRange} />
            </div>
          )}

          {!selectedSymbol && (
            <TrendingStocks
              watchlistSymbols={storedSymbolsWithNames.map((s) => s.symbol)}
              onSelectSymbol={setSelectedSymbol}
              onWatchlistChange={refreshStoredSymbols}
            />
          )}

          {selectedSymbol &&
            (isChartLoading ? (
              <ChartSkeleton />
            ) : hasChartData ? (
              <CandlestickChart
                chartData={symbolData.chartData}
                earnings={symbolData.earnings}
              />
            ) : null)}
          {selectedSymbol && (
            <StockTabs
              isLoading={isChartLoading}
              selectedSymbol={selectedSymbol}
              news={symbolData.news}
              quarterlyFundamentalsData={symbolData.quarterlyFundamentalsData}
              annualFundamentalsData={symbolData.annualFundamentalsData}
              earnings={symbolData.earnings}
              patternTableData={symbolData.patternTableData}
              chartData={symbolData.chartData}
            />
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}

export default function WrappedApp(props) {
  return (
    <QueryClientProvider client={queryClient}>
      <ModeProvider>
        <SnackbarProvider>
          <App {...props} />
        </SnackbarProvider>
      </ModeProvider>
    </QueryClientProvider>
  );
}
