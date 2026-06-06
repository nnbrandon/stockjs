import { useEffect, useState } from "react";
import { Box, Tabs, Tab } from "@mui/material";
import LoadingPanel from "../LoadingPanel/LoadingPanel";
import NewsList from "../NewsList/NewsList";
import QuarterlyFundamentalsTable from "../QuarterlyFundamentalsTable/QuarterlyFundamentalsTable";
import AnnualFundamentalsTable from "../AnnualFundamentalsTable/AnnualFundamentalsTable";
import AnalystPanel from "../AnalystPanel/AnalystPanel";
import RecentEarningsBanner from "../RecentEarningsBanner/RecentEarningsBanner";
import styles from "./StockTabs.module.css";

const TAB_DEFINITIONS = [
  { id: "news", label: "News" },
  { id: "quarterly", label: "Quarterly Financials" },
  { id: "annual", label: "Annual Financials" },
  { id: "analyst", label: "AI Committee" },
];

const tabsSx = {
  borderBottom: "1px solid var(--palette-divider)",
  minHeight: 44,
  "& .MuiTabs-indicator": {
    height: 2,
    backgroundColor: "var(--palette-success)",
  },
  "& .MuiTab-root": {
    textTransform: "none",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: "-0.005em",
    minHeight: 44,
    padding: "10px 16px",
    color: "var(--palette-text-secondary)",
    transition: "color 150ms ease",
    "&:hover": { color: "var(--palette-text-primary)" },
    "&.Mui-selected": { color: "var(--palette-text-primary)" },
  },
};

function StockTabs({
  isLoading,
  selectedSymbol,
  news,
  quarterlyFundamentalsData,
  annualFundamentalsData,
  earnings,
  chartData,
  position,
}) {
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    setActiveTab(0);
  }, [selectedSymbol]);

  const hasChartData = chartData && chartData.length > 0;
  const hasQuarterly =
    quarterlyFundamentalsData && quarterlyFundamentalsData.length > 0;
  const hasAnnual = annualFundamentalsData && annualFundamentalsData.length > 0;

  return (
    <div className={styles.tabsPanel}>
      <RecentEarningsBanner symbol={selectedSymbol} earnings={earnings} />
      <Tabs
        value={activeTab}
        onChange={(_, newValue) => setActiveTab(newValue)}
        sx={tabsSx}
      >
        {TAB_DEFINITIONS.map((tab) => (
          <Tab key={tab.id} label={tab.label} disableRipple />
        ))}
      </Tabs>

      <Box className={styles.tabPanel}>
        {activeTab === 0 && <NewsList news={news} />}
        {activeTab === 1 && (
          <LoadingPanel loading={isLoading} isEmpty={!hasQuarterly}>
            <div className={styles.tableContainer}>
              <QuarterlyFundamentalsTable
                quarterlyFundamentalsData={quarterlyFundamentalsData}
                earnings={earnings}
              />
            </div>
          </LoadingPanel>
        )}
        {activeTab === 2 && (
          <LoadingPanel loading={isLoading} isEmpty={!hasAnnual}>
            <div className={styles.tableContainer}>
              <AnnualFundamentalsTable
                annualFundamentalsData={annualFundamentalsData}
              />
            </div>
          </LoadingPanel>
        )}
        {activeTab === 3 && (
          <LoadingPanel
            loading={isLoading}
            isEmpty={!hasChartData && !hasQuarterly && !(news && news.length)}
          >
            <AnalystPanel
              symbol={selectedSymbol}
              quarterly={quarterlyFundamentalsData}
              annual={annualFundamentalsData}
              earnings={earnings}
              news={news}
              position={position}
            />
          </LoadingPanel>
        )}
      </Box>
    </div>
  );
}

export default StockTabs;
