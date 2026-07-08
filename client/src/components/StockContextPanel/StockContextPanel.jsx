import { useEffect, useState } from "react";
import { Tabs, Tab } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import TableChartIcon from "@mui/icons-material/TableChart";

import LoadingPanel from "../LoadingPanel/LoadingPanel";
import NewsList from "../NewsList/NewsList";
import AnalystPanel from "../AnalystPanel/AnalystPanel";
import RecentEarningsBanner from "../RecentEarningsBanner/RecentEarningsBanner";
import FinancialsModal from "../FinancialsModal/FinancialsModal";
import AiCommitteeHelpButton from "../AiCommitteeHelp/AiCommitteeHelpButton";
import ResizableSidebar from "../ResizableSidebar/ResizableSidebar";
import styles from "./StockContextPanel.module.css";

const tabsSx = {
  minHeight: 40,
  flex: 1,
  "& .MuiTabs-indicator": {
    height: 2,
    backgroundColor: "var(--palette-success)",
  },
  "& .MuiTab-root": {
    textTransform: "none",
    fontFamily: "var(--font-body)",
    fontSize: 12.5,
    fontWeight: 500,
    minHeight: 40,
    minWidth: 0,
    padding: "8px 12px",
    color: "var(--palette-text-secondary)",
    "&:hover": { color: "var(--palette-text-primary)" },
    "&.Mui-selected": { color: "var(--palette-text-primary)" },
  },
};

export default function StockContextPanel({
  isLoading,
  selectedSymbol,
  news,
  quarterlyFundamentalsData,
  annualFundamentalsData,
  earnings,
  chartData,
  position,
  positionsLoading,
  activeTab,
  onTabChange,
  onOpenSyncSetup,
  panelWidth,
  isResizing,
  onResizeStart,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [financialsModal, setFinancialsModal] = useState(null);

  useEffect(() => {
    setFinancialsModal(null);
  }, [selectedSymbol]);

  useEffect(() => {
    if (activeTab === 1) setCollapsed(false);
  }, [activeTab]);

  const hasChartData = chartData?.length > 0;
  const hasQuarterly = quarterlyFundamentalsData?.length > 0;
  const hasAnnual = annualFundamentalsData?.length > 0;

  return (
    <>
      <ResizableSidebar
        width={panelWidth}
        isResizing={isResizing}
        onResizeStart={onResizeStart}
        collapsed={collapsed}
        ariaLabel="Stock context"
        collapsedClassName={styles.panelCollapsed}
        panelClassName={styles.panel}
        collapsedContent={
          <button
            type="button"
            className={styles.expandBtn}
            onClick={() => setCollapsed(false)}
            aria-label="Expand context panel"
          >
            <ChevronLeftIcon fontSize="small" />
          </button>
        }
      >
        <div className={styles.toolbar}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => onTabChange(v)}
            sx={tabsSx}
            variant="fullWidth"
          >
            <Tab label="News" disableRipple />
            <Tab label="AI Committee" disableRipple />
          </Tabs>
          <AiCommitteeHelpButton className={styles.helpBtn} />
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => setCollapsed(true)}
            aria-label="Collapse context panel"
          >
            <ChevronRightIcon fontSize="small" />
          </button>
        </div>

        <div className={styles.earningsWrap}>
          <RecentEarningsBanner symbol={selectedSymbol} earnings={earnings} />
        </div>

        <div className={styles.scroll}>
          {activeTab === 0 && <NewsList news={news} compact />}
          {activeTab === 1 && (
            <LoadingPanel
              loading={isLoading}
              isEmpty={
                !hasChartData && !hasQuarterly && !(news && news.length)
              }
            >
              <AnalystPanel
                symbol={selectedSymbol}
                position={position}
                positionsLoading={positionsLoading}
                onOpenSyncSetup={onOpenSyncSetup}
                compact
              />
            </LoadingPanel>
          )}
        </div>

        <div className={styles.financialsBar}>
          <button
            type="button"
            className={styles.financialsBtn}
            onClick={() => setFinancialsModal(0)}
            disabled={!isLoading && !hasQuarterly}
          >
            <TableChartIcon sx={{ fontSize: 15 }} />
            Quarterly
          </button>
          <button
            type="button"
            className={styles.financialsBtn}
            onClick={() => setFinancialsModal(1)}
            disabled={!isLoading && !hasAnnual}
          >
            <TableChartIcon sx={{ fontSize: 15 }} />
            Annual
          </button>
        </div>
      </ResizableSidebar>

      {financialsModal !== null && (
        <FinancialsModal
          symbol={selectedSymbol}
          quarterly={quarterlyFundamentalsData}
          annual={annualFundamentalsData}
          earnings={earnings}
          isLoading={isLoading}
          initialTab={financialsModal}
          onClose={() => setFinancialsModal(null)}
        />
      )}
    </>
  );
}
