import { useState } from "react";
import Modal from "@mui/material/Modal";
import Tabs from "@mui/material/Tab";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

import LoadingPanel from "../LoadingPanel/LoadingPanel";
import QuarterlyFundamentalsTable from "../QuarterlyFundamentalsTable/QuarterlyFundamentalsTable";
import AnnualFundamentalsTable from "../AnnualFundamentalsTable/AnnualFundamentalsTable";
import modalStyles from "../AddTickerModal/AddTickerModal.module.css";
import styles from "./FinancialsModal.module.css";

const tabsSx = {
  borderBottom: "1px solid var(--palette-divider)",
  minHeight: 40,
  "& .MuiTabs-indicator": {
    height: 2,
    backgroundColor: "var(--palette-success)",
  },
  "& .MuiTab-root": {
    textTransform: "none",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontWeight: 500,
    minHeight: 40,
    padding: "8px 16px",
    color: "var(--palette-text-secondary)",
    "&.Mui-selected": { color: "var(--palette-text-primary)" },
  },
};

export default function FinancialsModal({
  symbol,
  quarterly,
  annual,
  earnings,
  isLoading,
  initialTab = 0,
  onClose,
}) {
  const [tab, setTab] = useState(initialTab);
  const hasQuarterly = quarterly?.length > 0;
  const hasAnnual = annual?.length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      aria-labelledby="financials-modal-title"
      slotProps={{ backdrop: { className: modalStyles.backdrop } }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <div className={modalStyles.titleGroup}>
            <h2 id="financials-modal-title" className={modalStyles.title}>
              {symbol} financials
            </h2>
            <p className={modalStyles.subtitle}>
              Quarterly and annual fundamentals from cached data.
            </p>
          </div>
          <IconButton
            className={modalStyles.closeBtn}
            onClick={onClose}
            aria-label="Close"
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </div>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={tabsSx}>
          <Tab label="Quarterly" disableRipple />
          <Tab label="Annual" disableRipple />
        </Tabs>

        <div className={styles.body}>
          {tab === 0 && (
            <LoadingPanel loading={isLoading} isEmpty={!hasQuarterly}>
              <div className={styles.tableWrap}>
                <QuarterlyFundamentalsTable
                  quarterlyFundamentalsData={quarterly}
                  earnings={earnings}
                />
              </div>
            </LoadingPanel>
          )}
          {tab === 1 && (
            <LoadingPanel loading={isLoading} isEmpty={!hasAnnual}>
              <div className={styles.tableWrap}>
                <AnnualFundamentalsTable
                  annualFundamentalsData={annual}
                />
              </div>
            </LoadingPanel>
          )}
        </div>
      </div>
    </Modal>
  );
}
