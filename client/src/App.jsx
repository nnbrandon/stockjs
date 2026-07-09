// App.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMatch, useNavigate } from "react-router";
import { ThemeProvider, CssBaseline } from "@mui/material";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import { lightTheme, darkTheme } from "./theme";
import { deleteSymbolData } from "./db";
import useStoredSymbols from "./hooks/useStoredSymbols";
import usePositions from "./hooks/usePositions";
import useSymbolData from "./hooks/useSymbolData";
import useLiveStockData from "./hooks/useLiveStockData";
import useRefreshData from "./hooks/useRefreshData";
import useResizablePanelWidth from "./hooks/useResizablePanelWidth";
import useEnsureSymbolData from "./hooks/useEnsureSymbolData";
import SymbolChart from "./components/CandlestickChart/SymbolChart";
import ChartSkeleton from "./components/CandlestickChart/ChartSkeleton";
import AddTickerModal from "./components/AddTickerModal/AddTickerModal";
import ImportFidelityPortfolioModal from "./components/ImportFidelityPortfolioModal/ImportFidelityPortfolioModal";
import ReportPortfolioSyncModal from "./components/ReportPortfolioSyncModal/ReportPortfolioSyncModal";
import Navbar from "./components/Navbar/Navbar";
import NavbarMini from "./components/Navbar/NavbarMini";
import SymbolSearch from "./components/SymbolSearch/SymbolSearch";
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
import { addSymbolToWatchlist } from "./utils/addSymbolToWatchlist";
import normalizeSymbol from "./utils/normalizeSymbol";

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
  const navigate = useNavigate();

  const [showNavBar, setShowNavBar] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showAddTickerModal, setShowAddTickerModal] = useState(false);
  const [showImportPortfolioModal, setShowImportPortfolioModal] =
    useState(false);
  const [showReportSyncModal, setShowReportSyncModal] = useState(false);
  const [isAddingToWatchlist, setIsAddingToWatchlist] = useState(false);

  const [range, setRange] = useState();
  const {
    width: panelWidth,
    isResizing,
    onResizeStart,
  } = useResizablePanelWidth();

  // ── Navigation is derived from the URL (HashRouter) — no parallel state ──
  // /stock/:symbol            → News tab; /stock/:symbol/committee → AI tab.
  const stockMatch = useMatch("/stock/:symbol");
  const committeeMatch = useMatch("/stock/:symbol/committee");
  const routeSymbolRaw =
    committeeMatch?.params.symbol ?? stockMatch?.params.symbol ?? null;
  const selectedSymbol = useMemo(
    () => normalizeSymbol(routeSymbolRaw),
    [routeSymbolRaw],
  );
  const contextTab = committeeMatch ? 1 : 0;

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  const handleSelectSymbol = useCallback(
    (symbol, options = {}) => {
      const normalized = normalizeSymbol(symbol);
      if (!normalized) return;
      setMobileNavOpen(false);
      navigate(
        options.openCommittee
          ? `/stock/${normalized}/committee`
          : `/stock/${normalized}`,
      );
    },
    [navigate],
  );

  const handleGoHome = useCallback(() => {
    setMobileNavOpen(false);
    navigate("/");
  }, [navigate]);

  // Tab switch replaces history so Back leaves the stock view rather than
  // cycling News ↔ AI Committee.
  const handleTabChange = useCallback(
    (tab) => {
      if (!selectedSymbol) return;
      navigate(
        tab === 1
          ? `/stock/${selectedSymbol}/committee`
          : `/stock/${selectedSymbol}`,
        { replace: true },
      );
    },
    [navigate, selectedSymbol],
  );

  // A URL with a malformed symbol (hand-edited) → home.
  useEffect(() => {
    if (routeSymbolRaw && !selectedSymbol) {
      navigate("/", { replace: true });
    }
  }, [routeSymbolRaw, selectedSymbol, navigate]);

  const { storedSymbolsWithNames, refresh: refreshStoredSymbols } =
    useStoredSymbols();
  const {
    positions,
    positionsBySymbol,
    isLoading: positionsLoading,
    refresh: refreshPositions,
  } = usePositions();

  const symbolData = useSymbolData(selectedSymbol, range);

  // Cold-start: a deep-linked/browsed symbol may have no cached data yet.
  // Seed it (data only — NOT watchlist membership) so the page works.
  const ensureData = useEnsureSymbolData(selectedSymbol);
  const isSeeding = ensureData.status === "seeding";
  const seedError = ensureData.status === "error" ? ensureData.error : null;

  // While the market is open, poll every watchlist symbol's 6-month price
  // history once a minute and push live updates into IndexedDB; useSymbolData
  // and the sidebar sparklines re-read on signal.
  const watchlistSymbols = useMemo(
    () => storedSymbolsWithNames.map((s) => s.symbol),
    [storedSymbolsWithNames],
  );
  useLiveStockData(watchlistSymbols);

  const isSelectedMember = selectedSymbol
    ? watchlistSymbols.includes(selectedSymbol)
    : false;

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

  const isChartLoading =
    symbolData.isLoading || isRefreshingAll || isSeeding;
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

  const handleAddToWatchlist = async () => {
    if (!selectedSymbol) return;
    setIsAddingToWatchlist(true);
    try {
      await addSymbolToWatchlist(selectedSymbol);
      await refreshStoredSymbols();
      showSnackbar(`${selectedSymbol} added to your watchlist.`, "success");
    } catch (error) {
      showSnackbar(
        `Couldn't add ${selectedSymbol}: ${error.message}`,
        "error",
      );
    } finally {
      setIsAddingToWatchlist(false);
    }
  };

  const openAddTicker = () => {
    setMobileNavOpen(false);
    setShowAddTickerModal(true);
  };
  const openImport = () => {
    setMobileNavOpen(false);
    setShowImportPortfolioModal(true);
  };
  const openSync = () => {
    setMobileNavOpen(false);
    setShowReportSyncModal(true);
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

  // Shared props for the sidebar (rendered as desktop rail AND mobile drawer).
  const navProps = {
    mode,
    toggleTheme,
    storedSymbolsWithNames,
    selectedSymbol,
    onClickAddTickerModal: openAddTicker,
    onClickImportPortfolioModal: openImport,
    onClickReportSyncModal: openSync,
    onClickSymbol: handleSelectSymbol,
    onClickHome: handleGoHome,
    onRefreshAllTickers: refreshAll,
    isRefreshingAll,
  };

  const stockActions = (
    <StockActions
      selectedSymbol={selectedSymbol}
      isRefreshingData={isRefreshingData}
      onRefresh={refreshSymbol}
      onDelete={handleDelete}
      isMember={isSelectedMember}
      isAddingToWatchlist={isAddingToWatchlist}
      onAddToWatchlist={handleAddToWatchlist}
    />
  );

  return (
    <PortfolioCommitteeProvider positions={positions}>
      <div className={styles.container}>
        {/* Desktop sidebar (display:contents on desktop, hidden on mobile) */}
        <div className={styles.desktopNav}>
          {showNavBar ? (
            <Navbar {...navProps} onCloseNav={() => setShowNavBar(false)} />
          ) : (
            <NavbarMini
              mode={mode}
              toggleTheme={toggleTheme}
              storedSymbolsWithNames={storedSymbolsWithNames}
              selectedSymbol={selectedSymbol}
              onClickImportPortfolioModal={openImport}
              onClickReportSyncModal={openSync}
              onClickSymbol={handleSelectSymbol}
              onClickHome={handleGoHome}
              onRefreshAllTickers={refreshAll}
              isRefreshingAll={isRefreshingAll}
              onExpandNav={() => setShowNavBar(true)}
            />
          )}
        </div>

        {/* Mobile top bar (hidden on desktop) */}
        <header className={styles.mobileTopBar}>
          <IconButton
            className={styles.mobileMenuBtn}
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            sx={{
              width: 40,
              height: 40,
              borderRadius: "var(--shape-radius-sm)",
              border: "1px solid var(--palette-divider)",
              color: "var(--palette-text-secondary)",
            }}
          >
            <MenuIcon fontSize="small" />
          </IconButton>
          <button
            type="button"
            className={styles.mobileLogo}
            onClick={handleGoHome}
          >
            stockjs
          </button>
          <div className={styles.mobileSearch}>
            <SymbolSearch
              onSelectSymbol={handleSelectSymbol}
              placeholder="Search…"
            />
          </div>
        </header>

        {/* Mobile drawer + backdrop (hidden on desktop) */}
        {mobileNavOpen && (
          <div
            className={styles.mobileBackdrop}
            onClick={closeMobileNav}
            aria-hidden
          />
        )}
        <div
          className={`${styles.mobileNav} ${mobileNavOpen ? styles.mobileNavOpen : ""}`}
        >
          <Navbar {...navProps} onCloseNav={closeMobileNav} />
        </div>

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
                  <HomeView
                    positions={positions}
                    onSelectSymbol={handleSelectSymbol}
                    onImportPortfolio={openImport}
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
              <HomeView
                positions={positions}
                onSelectSymbol={handleSelectSymbol}
                onImportPortfolio={openImport}
              />
            )
          ) : seedError ? (
            <div className={styles.errorState}>
              <h2 className={styles.errorTitle}>
                Couldn&apos;t load {selectedSymbol}
              </h2>
              <p className={styles.errorText}>{seedError}</p>
              <Button
                variant="outlined"
                onClick={handleGoHome}
                sx={{
                  backgroundColor: "var(--palette-bg-elevated)",
                  border: "1px solid var(--palette-divider)",
                  color: "var(--palette-text-primary)",
                  "&:hover": {
                    backgroundColor: "var(--palette-bg-elevated)",
                    borderColor: "var(--palette-divider-strong)",
                  },
                }}
              >
                Back to home
              </Button>
            </div>
          ) : (
            <div className={styles.symbolWorkspace}>
              <div className={styles.symbolMain}>
                <StockHeader
                  selectedSymbol={selectedSymbol}
                  chartData={symbolData.chartData}
                  position={selectedPosition}
                  isLoading={isChartLoading}
                >
                  {stockActions}
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
                onTabChange={handleTabChange}
                onOpenSyncSetup={openSync}
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
