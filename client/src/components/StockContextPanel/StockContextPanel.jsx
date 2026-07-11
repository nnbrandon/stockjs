import { useEffect, useState } from "react";
import { Tabs, Tab } from "@mui/material";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
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

const chevronBtnSx = {
  width: 36,
  height: 36,
  borderRadius: 0,
  color: "var(--palette-text-secondary)",
  "&:hover": {
    backgroundColor: "var(--palette-bg-hover)",
    color: "var(--palette-text-primary)",
  },
};

const financialsBtnSx = {
  flex: 1,
  padding: "8px 10px",
  fontSize: 12,
  backgroundColor: "var(--palette-bg-elevated)",
  border: "1px solid var(--palette-divider)",
  color: "var(--palette-text-primary)",
  "&:hover": {
    backgroundColor: "var(--palette-bg-hover)",
    borderColor: "var(--palette-divider-strong)",
  },
  "&.Mui-disabled": { opacity: 0.45 },
};

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
          <IconButton
            sx={chevronBtnSx}
            onClick={() => setCollapsed(false)}
            aria-label="Expand context panel"
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        }
      >
        <div className={styles.toolbar}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => onTabChange(v)}
            sx={tabsSx}
            variant="fullWidth"
          >
            <Tab label="AI Committee" value={1} disableRipple />
            <Tab label="News" value={0} disableRipple />
          </Tabs>
          <AiCommitteeHelpButton className={styles.helpBtn} />
          <IconButton
            sx={chevronBtnSx}
            onClick={() => setCollapsed(true)}
            aria-label="Collapse context panel"
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
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
          <Button
            variant="outlined"
            sx={financialsBtnSx}
            onClick={() => setFinancialsModal(0)}
            disabled={!isLoading && !hasQuarterly}
            startIcon={<TableChartIcon sx={{ fontSize: 15 }} />}
          >
            Quarterly
          </Button>
          <Button
            variant="outlined"
            sx={financialsBtnSx}
            onClick={() => setFinancialsModal(1)}
            disabled={!isLoading && !hasAnnual}
            startIcon={<TableChartIcon sx={{ fontSize: 15 }} />}
          >
            Annual
          </Button>
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
