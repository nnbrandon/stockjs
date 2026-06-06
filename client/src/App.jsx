// App.js
import { useState } from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { lightTheme, darkTheme } from "./theme";
import { deleteSymbolData } from "./db";
import useStoredSymbols from "./hooks/useStoredSymbols";
import usePositions from "./hooks/usePositions";
import useSymbolData from "./hooks/useSymbolData";
import useRefreshData from "./hooks/useRefreshData";
import useResizablePanelWidth from "./hooks/useResizablePanelWidth";
import CandlestickChart from "./components/CandlestickChart/CandlestickChart";
import ChartSkeleton from "./components/CandlestickChart/ChartSkeleton";
import AddTickerModal from "./components/AddTickerModal/AddTickerModal";
import ImportFidelityPortfolioModal from "./components/ImportFidelityPortfolioModal/ImportFidelityPortfolioModal";
import Navbar from "./components/Navbar/Navbar";
import NavbarMini from "./components/Navbar/NavbarMini";
import StockHeader from "./components/StockHeader/StockHeader";
import StockActions from "./components/StockActions/StockActions";
import StatRow from "./components/StatRow/StatRow";
import StockContextPanel from "./components/StockContextPanel/StockContextPanel";
import TimerangeSelector from "./components/TimerangeSelector/TimerangeSelector";
import HomeView from "./components/HomeView/HomeView";
import PortfolioCommitteePanel from "./components/PortfolioCommitteePanel/PortfolioCommitteePanel";
import styles from "./App.module.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider, useSnackbar } from "./components/SnackbarProvider";
import { ModeProvider, useMode } from "./components/ModeProvider";
import { queryClient } from "./queryClient";

function App() {
  const { mode, toggleTheme } = useMode();
  const showSnackbar = useSnackbar();
  const [showNavBar, setShowNavBar] = useState(false);
  const [showAddTickerModal, setShowAddTickerModal] = useState(false);
  const [showImportPortfolioModal, setShowImportPortfolioModal] =
    useState(false);

  const [range, setRange] = useState();
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [contextTab, setContextTab] = useState(0);
  const { width: panelWidth, isResizing, onResizeStart } =
    useResizablePanelWidth();

  const handleSelectSymbol = (symbol, options = {}) => {
    setSelectedSymbol(symbol);
    setContextTab(options.openCommittee ? 1 : 0);
  };

  const handleGoHome = () => {
    setSelectedSymbol(null);
    setContextTab(0);
  };

  const { storedSymbolsWithNames, refresh: refreshStoredSymbols } =
    useStoredSymbols();
  const {
    positions,
    positionsBySymbol,
    isLoading: positionsLoading,
    refresh: refreshPositions,
  } = usePositions();

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
  const hasPortfolio = positions.length > 0;
  const selectedPosition = selectedSymbol
    ? positionsBySymbol[selectedSymbol]
    : null;

  const handleDelete = () => {
    deleteSymbolData(selectedSymbol).then(() => {
      handleGoHome();
      refreshStoredSymbols();
      refreshPositions();
    });
  };

  const handleAddTickerClose = (tickerInputValue) => {
    setShowAddTickerModal(false);
    if (tickerInputValue) {
      refreshStoredSymbols();
      handleSelectSymbol(tickerInputValue);
    }
  };

  const handleImportPortfolioClose = (result) => {
    setShowImportPortfolioModal(false);
    if (!result) return;

    refreshStoredSymbols();
    refreshPositions();

    let message = `Imported ${result.imported} position${result.imported === 1 ? "" : "s"}.`;
    if (result.failed > 0) {
      message += ` ${result.failed} symbol(s) need a manual refresh for market data.`;
    }
    showSnackbar(message, result.failed > 0 ? "warning" : "success");
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
            onClickImportPortfolioModal={() =>
              setShowImportPortfolioModal(true)
            }
            onClickSymbol={handleSelectSymbol}
            onClickHome={handleGoHome}
            onRefreshAllTickers={refreshAll}
            isRefreshingAll={isRefreshingAll}
          />
        )}
        {!showNavBar && (
          <NavbarMini
            mode={mode}
            toggleTheme={toggleTheme}
            storedSymbolsWithNames={storedSymbolsWithNames}
            selectedSymbol={selectedSymbol}
            onExpandNav={() => setShowNavBar(true)}
            onClickAddTickerModal={() => setShowAddTickerModal(true)}
            onClickImportPortfolioModal={() =>
              setShowImportPortfolioModal(true)
            }
            onClickSymbol={handleSelectSymbol}
            onClickHome={handleGoHome}
            onRefreshAllTickers={refreshAll}
            isRefreshingAll={isRefreshingAll}
          />
        )}

        {showAddTickerModal && (
          <AddTickerModal range={range} onClose={handleAddTickerClose} />
        )}

        {showImportPortfolioModal && (
          <ImportFidelityPortfolioModal onClose={handleImportPortfolioClose} />
        )}

        <div
          className={`${styles.view} ${selectedSymbol ? styles.viewSymbol : ""} ${!selectedSymbol && hasPortfolio ? styles.viewHomePortfolio : ""}`}
        >
          {!selectedSymbol ? (
            hasPortfolio ? (
              <div className={styles.homeWorkspace}>
                <div className={styles.homeMain}>
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
                    position={selectedPosition}
                    isLoading={isChartLoading}
                  />

                  <HomeView
                    positions={positions}
                    watchlistSymbols={storedSymbolsWithNames.map(
                      (s) => s.symbol,
                    )}
                    onSelectSymbol={handleSelectSymbol}
                    onWatchlistChange={refreshStoredSymbols}
                    onImportPortfolio={() => setShowImportPortfolioModal(true)}
                  />
                </div>

                <PortfolioCommitteePanel
                  positions={positions}
                  positionsLoading={positionsLoading}
                  onSelectSymbol={handleSelectSymbol}
                  panelWidth={panelWidth}
                  isResizing={isResizing}
                  onResizeStart={onResizeStart}
                />
              </div>
            ) : (
              <>
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
                  position={selectedPosition}
                  isLoading={isChartLoading}
                />

                <HomeView
                  positions={positions}
                  watchlistSymbols={storedSymbolsWithNames.map((s) => s.symbol)}
                  onSelectSymbol={handleSelectSymbol}
                  onWatchlistChange={refreshStoredSymbols}
                  onImportPortfolio={() => setShowImportPortfolioModal(true)}
                />
              </>
            )
          ) : (
            <div className={styles.symbolWorkspace}>
              <div className={styles.symbolMain}>
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
                  position={selectedPosition}
                  isLoading={isChartLoading}
                />

                <div className={styles.chartControls}>
                  <TimerangeSelector onChange={setRange} />
                </div>

                {isChartLoading ? (
                  <ChartSkeleton />
                ) : hasChartData ? (
                  <CandlestickChart
                    chartData={symbolData.chartData}
                    earnings={symbolData.earnings}
                  />
                ) : null}
              </div>

              <StockContextPanel
                isLoading={isChartLoading}
                selectedSymbol={selectedSymbol}
                news={symbolData.news}
                quarterlyFundamentalsData={
                  symbolData.quarterlyFundamentalsData
                }
                annualFundamentalsData={symbolData.annualFundamentalsData}
                earnings={symbolData.earnings}
                chartData={symbolData.chartData}
                position={selectedPosition}
                positionsLoading={positionsLoading}
                supplementalDataReady={symbolData.isSupplementalDataReady}
                activeTab={contextTab}
                onTabChange={setContextTab}
                panelWidth={panelWidth}
                isResizing={isResizing}
                onResizeStart={onResizeStart}
              />
            </div>
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
