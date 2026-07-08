// App.js
import { useEffect, useMemo, useRef, useState } from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { lightTheme, darkTheme } from "./theme";
import { deleteSymbolData } from "./db";
import useStoredSymbols from "./hooks/useStoredSymbols";
import usePositions from "./hooks/usePositions";
import useSymbolData from "./hooks/useSymbolData";
import useLiveStockData from "./hooks/useLiveStockData";
import useRefreshData from "./hooks/useRefreshData";
import useResizablePanelWidth from "./hooks/useResizablePanelWidth";
import SymbolChart from "./components/CandlestickChart/SymbolChart";
import ChartSkeleton from "./components/CandlestickChart/ChartSkeleton";
import AddTickerModal from "./components/AddTickerModal/AddTickerModal";
import ImportFidelityPortfolioModal from "./components/ImportFidelityPortfolioModal/ImportFidelityPortfolioModal";
import ReportPortfolioSyncModal from "./components/ReportPortfolioSyncModal/ReportPortfolioSyncModal";
import Navbar from "./components/Navbar/Navbar";
import NavbarMini from "./components/Navbar/NavbarMini";
import StockHeader from "./components/StockHeader/StockHeader";
import StockActions from "./components/StockActions/StockActions";
import StatRow from "./components/StatRow/StatRow";
import StockContextPanel from "./components/StockContextPanel/StockContextPanel";
import TimerangeSelector from "./components/TimerangeSelector/TimerangeSelector";
import HomeView from "./components/HomeView/HomeView";
import PortfolioCommitteePanel from "./components/PortfolioCommitteePanel/PortfolioCommitteePanel";
import { PortfolioCommitteeProvider } from "./components/PortfolioCommitteePanel/PortfolioCommitteeProvider";
import CommitteeBackgroundIndicator from "./components/PortfolioCommitteePanel/CommitteeBackgroundIndicator";
import styles from "./App.module.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider, useSnackbar } from "./components/SnackbarProvider";
import { ModeProvider, useMode } from "./components/ModeProvider";
import { queryClient } from "./queryClient";
import {
  shouldAutoRefreshToday,
  markAutoRefreshedToday,
} from "./utils/dailyRefresh";
import {
  isReportSyncConfigured,
  syncReportPortfolio,
} from "./utils/reportPortfolioSync";

// Bridges the current mode from ModeProvider into MUI's ThemeProvider. Lives
// above SnackbarProvider so toasts (the refresh-all progress toast included)
// render inside the themed tree instead of falling back to MUI's light default.
function ThemedRoot({ children }) {
  const { mode } = useMode();
  return (
    <ThemeProvider theme={mode === "light" ? lightTheme : darkTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

function App() {
  const { mode, toggleTheme } = useMode();
  const showSnackbar = useSnackbar();
  const [showNavBar, setShowNavBar] = useState(true);
  const [showAddTickerModal, setShowAddTickerModal] = useState(false);
  const [showImportPortfolioModal, setShowImportPortfolioModal] =
    useState(false);
  const [showReportSyncModal, setShowReportSyncModal] = useState(false);

  const [range, setRange] = useState();
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [contextTab, setContextTab] = useState(0);
  const {
    width: panelWidth,
    isResizing,
    onResizeStart,
  } = useResizablePanelWidth();

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

  // While the market is open, poll every watchlist symbol's 6-month price
  // history once a minute and push live updates into IndexedDB; useSymbolData
  // and the sidebar sparklines re-read on signal.
  const watchlistSymbols = useMemo(
    () => storedSymbolsWithNames.map((s) => s.symbol),
    [storedSymbolsWithNames],
  );
  useLiveStockData(watchlistSymbols);

  const { refreshSymbol, refreshAll, isRefreshingData, isRefreshingAll } =
    useRefreshData({
      selectedSymbol,
      range,
      storedSymbolsWithNames,
      applyRefresh: symbolData.applyRefresh,
    });

  // On the first open of each day, refresh the whole watchlist once. Waits for
  // stored symbols to load (refreshAll no-ops on an empty list) and guards
  // against re-running on re-renders / StrictMode double-invokes.
  const didAutoRefreshRef = useRef(false);
  useEffect(() => {
    if (didAutoRefreshRef.current) return;
    if (!storedSymbolsWithNames.length) return;
    if (!shouldAutoRefreshToday()) return;

    didAutoRefreshRef.current = true;
    markAutoRefreshedToday();
    refreshAll();
  }, [storedSymbolsWithNames, refreshAll]);

  const isChartLoading = symbolData.isLoading || isRefreshingAll;
  const hasChartData = symbolData.chartData && symbolData.chartData.length > 0;
  const hasPortfolio = positions.length > 0;
  const selectedPosition = selectedSymbol
    ? positionsBySymbol[selectedSymbol]
    : null;

  const handleDelete = () => {
    deleteSymbolData(selectedSymbol).then(async () => {
      handleGoHome();
      refreshStoredSymbols();
      await refreshPositions();
      if (isReportSyncConfigured()) {
        await syncReportPortfolio();
      }
    });
  };

  const handleAddTickerClose = (tickerInputValue) => {
    setShowAddTickerModal(false);
    if (tickerInputValue) {
      refreshStoredSymbols();
      handleSelectSymbol(tickerInputValue);
    }
  };

  const handleImportPortfolioClose = async (result) => {
    setShowImportPortfolioModal(false);
    if (!result) return;

    await refreshStoredSymbols();
    await refreshPositions();

    let message = `Imported ${result.imported} position${result.imported === 1 ? "" : "s"}.`;
    if (result.failed > 0) {
      message += ` ${result.failed} symbol(s) need a manual refresh for market data.`;
    }

    if (isReportSyncConfigured()) {
      const sync = await syncReportPortfolio();
      if (sync.ok) {
        message += ` Daily email updated (${sync.count} holdings).`;
      } else if (sync.error) {
        showSnackbar(
          `${message} Email sync failed: ${sync.error}`,
          "warning",
        );
        return;
      }
    }

    showSnackbar(message, result.failed > 0 ? "warning" : "success");
  };

  const handleReportSyncClose = (result) => {
    setShowReportSyncModal(false);
    if (result?.synced) {
      showSnackbar(
        `Daily email synced (${result.synced} holding${result.synced === 1 ? "" : "s"}).`,
        "success",
      );
    }
  };

  return (
    <PortfolioCommitteeProvider positions={positions}>
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
            onClickReportSyncModal={() => setShowReportSyncModal(true)}
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
            onClickReportSyncModal={() => setShowReportSyncModal(true)}
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

        {showReportSyncModal && (
          <ReportPortfolioSyncModal
            positionCount={positions.length}
            onClose={handleReportSyncClose}
          />
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
                    isLoading={isChartLoading}
                  />

                  <HomeView
                    positions={positions}
                    watchlistSymbols={watchlistSymbols}
                    onSelectSymbol={handleSelectSymbol}
                    onWatchlistChange={refreshStoredSymbols}
                    onImportPortfolio={() => setShowImportPortfolioModal(true)}
                  />
                </div>

                <PortfolioCommitteePanel
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
                  isLoading={isChartLoading}
                />

                <HomeView
                  positions={positions}
                  watchlistSymbols={watchlistSymbols}
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
                  position={selectedPosition}
                  isLoading={isChartLoading}
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

                <div className={styles.chartControls}>
                  <TimerangeSelector onChange={setRange} />
                </div>

                {isChartLoading ? (
                  <ChartSkeleton />
                ) : hasChartData ? (
                  <SymbolChart
                    chartData={symbolData.chartData}
                    earnings={symbolData.earnings}
                  />
                ) : null}
              </div>

              <StockContextPanel
                isLoading={isChartLoading}
                selectedSymbol={selectedSymbol}
                news={symbolData.news}
                quarterlyFundamentalsData={symbolData.quarterlyFundamentalsData}
                annualFundamentalsData={symbolData.annualFundamentalsData}
                earnings={symbolData.earnings}
                chartData={symbolData.chartData}
                position={selectedPosition}
                positionsLoading={positionsLoading}
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
      {selectedSymbol && <CommitteeBackgroundIndicator onOpen={handleGoHome} />}
    </PortfolioCommitteeProvider>
  );
}

export default function WrappedApp(props) {
  return (
    <QueryClientProvider client={queryClient}>
      <ModeProvider>
        <ThemedRoot>
          <SnackbarProvider>
            <App {...props} />
          </SnackbarProvider>
        </ThemedRoot>
      </ModeProvider>
    </QueryClientProvider>
  );
}
