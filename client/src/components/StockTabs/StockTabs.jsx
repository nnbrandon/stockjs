import { useState } from "react";
import { Box, Tabs, Tab } from "@mui/material";
import LoadingPanel from "../LoadingPanel/LoadingPanel";
import NewsList from "../NewsList/NewsList";
import QuarterlyFundamentalsTable from "../QuarterlyFundamentalsTable/QuarterlyFundamentalsTable";
import AnnualFundamentalsTable from "../AnnualFundamentalsTable/AnnualFundamentalsTable";
import PatternTable from "../PatternTable/PatternTable";
import styles from "./StockTabs.module.css";

function StockTabs({
  isLoading,
  news,
  quarterlyFundamentalsData,
  annualFundamentalsData,
  patternTableData,
  chartData,
}) {
  const [activeTab, setActiveTab] = useState(0);

  const hasChartData = chartData && chartData.length > 0;
  const hasQuarterly =
    quarterlyFundamentalsData && quarterlyFundamentalsData.length > 0;
  const hasAnnual = annualFundamentalsData && annualFundamentalsData.length > 0;

  return (
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
        {activeTab === 1 && (
          <LoadingPanel loading={isLoading} isEmpty={!hasQuarterly}>
            <div className={styles.tableContainer}>
              <QuarterlyFundamentalsTable
                quarterlyFundamentalsData={quarterlyFundamentalsData}
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
          <LoadingPanel loading={isLoading} isEmpty={!hasChartData}>
            <div className={styles.tableContainer}>
              <PatternTable patternsData={patternTableData} />
            </div>
          </LoadingPanel>
        )}
      </Box>
    </Box>
  );
}

export default StockTabs;
