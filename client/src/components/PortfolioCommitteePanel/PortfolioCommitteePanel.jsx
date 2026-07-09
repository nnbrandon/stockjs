import { useMemo, useState } from "react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CircularProgress from "@mui/material/CircularProgress";

import AiCommitteeHelpButton from "../AiCommitteeHelp/AiCommitteeHelpButton";
import PortfolioHealthCard from "./PortfolioHealthCard";
import ResizableSidebar from "../ResizableSidebar/ResizableSidebar";
import { usePortfolioCommitteeContext } from "./PortfolioCommitteeProvider";
import { getVerdictContext } from "@stockjs/committee-engine/analyst/verdictContext.js";
import { getTierChange } from "@stockjs/committee-engine/analyst/verdictHistory.js";
import { getExitTimingAdvice } from "@stockjs/committee-engine/exitTimingAdvice.js";
import styles from "./PortfolioCommitteePanel.module.css";

// Chevron collapse/expand toggles — square ghost icon buttons.
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

// Full-width elevated action button ("Run committee").
const runBtnSx = {
  width: "100%",
  padding: "10px 14px",
  fontSize: 12.5,
  backgroundColor: "var(--palette-bg-elevated)",
  border: "1px solid var(--palette-divider)",
  color: "var(--palette-text-primary)",
  "&:hover": {
    backgroundColor: "var(--palette-bg-hover)",
    borderColor: "var(--palette-divider-strong)",
  },
  "&.Mui-disabled": { opacity: 0.5 },
};

// Inline text-link button ("Open chart", "Show scores", …).
const openBtnSx = {
  padding: 0,
  minWidth: 0,
  fontSize: 11.5,
  color: "var(--palette-success)",
  "&:hover": {
    backgroundColor: "transparent",
    textDecoration: "underline",
  },
};

// Compact bordered secondary button ("Re-run analysis").
const secondaryBtnSx = {
  flex: 1,
  padding: "7px 10px",
  fontSize: 11.5,
  border: "1px solid var(--palette-divider)",
  color: "var(--palette-text-secondary)",
  "&:hover": {
    backgroundColor: "var(--palette-bg-hover)",
    color: "var(--palette-text-primary)",
  },
};

// Filter chips (ToggleButtonGroup) — standalone mono chips, not a connected bar.
const chipGroupSx = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  mb: "14px",
  "& .MuiToggleButtonGroup-grouped": {
    margin: 0,
    border: "1px solid var(--palette-divider)",
    borderRadius: "var(--shape-radius-sm)",
  },
};

const CHIP_TONES = {
  buy: {
    color: "var(--palette-success)",
    borderColor:
      "color-mix(in srgb, var(--palette-success) 35%, var(--palette-divider))",
  },
  sell: {
    color: "var(--palette-error)",
    borderColor:
      "color-mix(in srgb, var(--palette-error) 35%, var(--palette-divider))",
  },
  fire: {
    color: "var(--palette-warning)",
    borderColor:
      "color-mix(in srgb, var(--palette-warning) 35%, var(--palette-divider))",
  },
};

function chipSx(tone) {
  const toneStyle = tone ? CHIP_TONES[tone] : {};
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    lineHeight: 1.2,
    padding: "4px 8px",
    textTransform: "none",
    color: "var(--palette-text-secondary)",
    backgroundColor: "var(--palette-bg-elevated)",
    ...toneStyle,
    "&:hover": {
      backgroundColor: "var(--palette-bg-hover)",
      color: toneStyle.color || "var(--palette-text-primary)",
    },
    "&.Mui-selected": {
      backgroundColor: "var(--palette-bg-hover)",
      color: toneStyle.color || "var(--palette-text-primary)",
      borderColor: "var(--palette-divider-strong)",
      boxShadow: "inset 0 0 0 1px var(--palette-divider-strong)",
      "&:hover": { backgroundColor: "var(--palette-bg-hover)" },
    },
  };
}

// Full-width muted button ("Clear results").
const clearBtnSx = {
  width: "100%",
  mb: "14px",
  padding: "7px 10px",
  fontSize: 11.5,
  border: "1px solid var(--palette-divider)",
  color: "var(--palette-text-disabled)",
  "&:hover": {
    backgroundColor: "var(--palette-bg-hover)",
    color: "var(--palette-text-secondary)",
  },
};

const FILTERS = {
  ALL: "ALL",
  BUY: "BUY",
  HOLD: "HOLD",
  SELL: "SELL",
  FIRE: "FIRE",
  CHANGED: "CHANGED",
  FUND: "FUND",
  NA: "NA",
};

const fmtScore = (n) => (Number.isFinite(n) ? n.toFixed(0) : "—");

const fmtShares = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, {
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
      })
    : "—";

const fmtDollars = (n) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : "—";

function getItemFilterKey(item) {
  if (item.isFund) return FILTERS.FUND;
  const action = item.report?.verdict?.action;
  if (action === "BUY" || action === "HOLD" || action === "SELL") return action;
  return FILTERS.NA;
}

function getItemTierChange(item) {
  return getTierChange(item.report, item.previousSnapshot);
}

function getItemFireSale(item) {
  return item.report?.verdict?.fireSale ?? null;
}

function fireSaleTitle(fireSale) {
  return `Priced low, not broken: finances score ${fmtScore(fireSale.fundamental)}/100 while the stock sits ${fmtScore(fireSale.offHighPct)}% below its 52-week high — a discount with room to bounce back.`;
}

function actionClass(action) {
  if (action === "BUY") return styles.actionBuy;
  if (action === "SELL") return styles.actionSell;
  return styles.actionHold;
}

function progressLabel(progress) {
  return progress.detail || "Analyzing on the server…";
}

function RunButtons({ count, disabled, onRun }) {
  return (
    <div className={styles.runActions}>
      <Button
        variant="outlined"
        sx={runBtnSx}
        onClick={onRun}
        disabled={disabled}
        startIcon={<AutoAwesomeIcon fontSize="small" />}
      >
        Run committee ({count})
      </Button>
    </div>
  );
}

function PositionVerdictCard({ item, onSelectSymbol }) {
  const [expanded, setExpanded] = useState(false);
  const { symbol, report, news, newsMood, error, isFund } = item;

  if (isFund) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeadStatic}>
          <span className={styles.cardSymbol}>{symbol}</span>
          <span className={styles.na}>Fund / ETF</span>
        </div>
        <div className={styles.cardBody}>
          <p className={styles.na}>
            Funds and ETFs track a basket of holdings, so the company committee
            doesn&apos;t score them.
          </p>
          <Button variant="text" sx={openBtnSx} onClick={() => onSelectSymbol(symbol)}>
            Open chart
          </Button>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeadStatic}>
          <span className={styles.cardSymbol}>{symbol}</span>
          <span className={styles.na}>No data</span>
        </div>
        <div className={styles.cardBody}>
          <p className={styles.na}>{error || "Not enough cached data."}</p>
          <Button variant="text" sx={openBtnSx} onClick={() => onSelectSymbol(symbol)}>
            Open chart
          </Button>
        </div>
      </div>
    );
  }

  const { verdict, pillars } = report;
  const tierChange = getItemTierChange(item);
  const context = getVerdictContext(verdict.action, {
    hasPosition: true,
    tier: verdict.tier,
    fireSale: verdict.fireSale,
  });

  // For SELL verdicts, surface the Portfolio Manager's suggested trim size in
  // this holder's actual shares/dollars.
  const portfolioManager = report.agents?.find(
    (a) => a.key === "portfolioManager",
  );
  const exitPlan = verdict.action === "SELL" ? portfolioManager?.plan : null;
  const quantity = item.position?.quantity;
  // Exit timing baked into every SELL/REDUCE, reasoned from the company's
  // financial trajectory over the past year.
  const horizonAdvice = getExitTimingAdvice({
    action: verdict.action,
    tier: verdict.tier,
    fundamentalScore: pillars?.fundamental,
    metrics: report.metrics,
  });
  const sellSizing =
    exitPlan?.kind === "exit" &&
    Number.isFinite(exitPlan.trimPct) &&
    Number.isFinite(quantity)
      ? {
          sharesToSell: (quantity * exitPlan.trimPct) / 100,
          proceeds: Number.isFinite(report.metrics?.price)
            ? ((quantity * exitPlan.trimPct) / 100) * report.metrics.price
            : null,
        }
      : null;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeadStatic}>
        <span className={styles.cardSymbol}>{symbol}</span>
        <span className={styles.cardMeta}>
          <span
            className={`${styles.actionBadge} ${actionClass(verdict.action)}`}
          >
            {(verdict.tier ?? verdict.action).toUpperCase()}
          </span>
          {verdict.fireSale && (
            <span
              className={styles.fireBadge}
              title={fireSaleTitle(verdict.fireSale)}
            >
              🔥 FIRE SALE
              {verdict.fireSale.confidenceLabel
                ? ` · ${verdict.fireSale.confidenceLabel}`
                : ""}
            </span>
          )}
          {tierChange && (
            <span
              className={`${styles.changeBadge} ${
                tierChange.direction === "upgrade"
                  ? styles.changeBadgeUp
                  : styles.changeBadgeDown
              }`}
              title={`Was ${tierChange.fromTier} (${fmtScore(tierChange.fromComposite)}) on ${tierChange.fromDay}`}
            >
              {tierChange.direction === "upgrade" ? "↑" : "↓"} was{" "}
              {tierChange.fromTier}
            </span>
          )}
          <span
            className={styles.convictionBadge}
            title={`${verdict.convictionLabel} confidence`}
          >
            {verdict.convictionLabel} Confidence
          </span>
          <span className={styles.score}>{fmtScore(verdict.composite)}</span>
        </span>
      </div>

      <div className={styles.cardBody}>
        <p className={styles.context}>{portfolioManager?.narrative || context}</p>

        {verdict.fireSale &&
          (verdict.fireSale.reasons?.length ||
            verdict.fireSale.cautions?.length) > 0 && (
            <div className={styles.fireDetail}>
              <p className={styles.fireDetailHead}>
                🔥 Why it&apos;s a fire sale
                {verdict.fireSale.confidenceLabel
                  ? ` — ${verdict.fireSale.confidenceLabel.toLowerCase()} confidence`
                  : ""}
              </p>
              <ul className={styles.fireDetailList}>
                {(verdict.fireSale.reasons ?? []).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
                {(verdict.fireSale.cautions ?? []).map((caution) => (
                  <li key={caution} className={styles.fireDetailCaution}>
                    {caution}
                  </li>
                ))}
              </ul>
            </div>
          )}

        {sellSizing && (
          <p className={styles.sellSizing}>
            {exitPlan.fullExit
              ? `Suggested: sell the full position (${fmtShares(quantity)} sh${
                  Number.isFinite(sellSizing.proceeds)
                    ? `, ≈${fmtDollars(sellSizing.proceeds)}`
                    : ""
                }).`
              : `Suggested: sell ~${exitPlan.trimPct}% — about ${fmtShares(sellSizing.sharesToSell)} of ${fmtShares(quantity)} sh${
                  Number.isFinite(sellSizing.proceeds)
                    ? ` (≈${fmtDollars(sellSizing.proceeds)})`
                    : ""
                }.`}
          </p>
        )}

        {horizonAdvice && (
          <div className={styles.horizonAdvice}>
            <p className={styles.horizonHeadline}>{horizonAdvice.headline}</p>
            {horizonAdvice.lines.map((line) => (
              <p key={line} className={styles.horizonLine}>
                {line}
              </p>
            ))}
          </div>
        )}

        {newsMood && <p className={styles.newsMood}>{newsMood}</p>}

        {news.length > 0 && (
          <ul className={styles.newsList}>
            {news.map((article) => (
              <li key={article.id || article.link} className={styles.newsItem}>
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {article.title}
                </a>
              </li>
            ))}
          </ul>
        )}

        {expanded && (
          <div className={styles.pillars}>
            <div className={styles.pillar}>
              <span className={styles.pillarLabel}>Trend</span>
              <span className={styles.pillarValue}>
                {fmtScore(pillars.technical)}
              </span>
            </div>
            <div className={styles.pillar}>
              <span className={styles.pillarLabel}>Finances</span>
              <span className={styles.pillarValue}>
                {fmtScore(pillars.fundamental)}
              </span>
            </div>
            <div className={styles.pillar}>
              <span className={styles.pillarLabel}>News</span>
              <span className={styles.pillarValue}>
                {fmtScore(pillars.sentiment)}
              </span>
            </div>
          </div>
        )}

        <div className={styles.cardActions}>
          <Button
            variant="text"
            sx={openBtnSx}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide scores" : "Show scores"}
          </Button>
          <Button
            variant="text"
            sx={openBtnSx}
            onClick={() => onSelectSymbol(symbol, { openCommittee: true })}
          >
            Open full committee
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioCommitteePanel({
  positionsLoading,
  onSelectSymbol,
  panelWidth,
  isResizing,
  onResizeStart,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [actionFilter, setActionFilter] = useState(FILTERS.ALL);
  const {
    status,
    results,
    progress,
    health,
    generatedAt,
    run,
    reset,
    count,
    configured,
  } = usePortfolioCommitteeContext();

  const runDisabled = positionsLoading || count === 0 || status === "running";

  const summary = useMemo(() => {
    const counts = {
      BUY: 0,
      HOLD: 0,
      SELL: 0,
      FUND: 0,
      NA: 0,
      CHANGED: 0,
      FIRE: 0,
    };
    for (const item of results) {
      counts[getItemFilterKey(item)] += 1;
      if (getItemTierChange(item)) counts.CHANGED += 1;
      if (getItemFireSale(item)) counts.FIRE += 1;
    }
    return counts;
  }, [results]);

  const filteredResults = useMemo(() => {
    if (actionFilter === FILTERS.ALL) return results;
    if (actionFilter === FILTERS.CHANGED)
      return results.filter((item) => getItemTierChange(item));
    if (actionFilter === FILTERS.FIRE)
      return results.filter((item) => getItemFireSale(item));
    return results.filter((item) => getItemFilterKey(item) === actionFilter);
  }, [results, actionFilter]);

  const handleRun = () => {
    setActionFilter(FILTERS.ALL);
    run();
  };

  const handleReset = () => {
    setActionFilter(FILTERS.ALL);
    reset();
  };

  return (
    <ResizableSidebar
      width={panelWidth}
      isResizing={isResizing}
      onResizeStart={onResizeStart}
      collapsed={collapsed}
      ariaLabel="Portfolio AI Committee"
      collapsedClassName={styles.panelCollapsed}
      panelClassName={styles.panel}
      collapsedContent={
        <IconButton
          sx={chevronBtnSx}
          onClick={() => setCollapsed(false)}
          aria-label="Expand portfolio committee panel"
        >
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
      }
    >
      <div className={styles.toolbar}>
        <span className={styles.title}>AI Committee</span>
        <div className={styles.toolbarActions}>
          <AiCommitteeHelpButton className={styles.helpBtn} />
          <IconButton
            sx={chevronBtnSx}
            onClick={() => setCollapsed(true)}
            aria-label="Collapse portfolio committee panel"
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </div>
      </div>

      <div className={styles.scroll}>
        {status === "idle" && (
          <div className={styles.intro}>
            <p className={styles.introText}>
              Review every portfolio holding — price trend, company finances,
              and news — with a buy/hold/sell call for each position. Analysis
              runs on the server, so this panel and your daily email always
              show the same verdicts.
            </p>
            {configured ? (
              <RunButtons
                count={count}
                disabled={runDisabled}
                onRun={handleRun}
              />
            ) : (
              <p className={styles.introText}>
                Set up the email report first (sidebar → Sync email report) —
                the committee runs on the server against your synced
                portfolio.
              </p>
            )}
            <p className={styles.introText}>
              Results refresh automatically every morning; run it manually
              anytime after importing new holdings.
            </p>
          </div>
        )}

        {status === "running" && (
          <div className={styles.progress}>
            <CircularProgress size={28} />
            <p className={styles.progressText}>{progressLabel(progress)}</p>
            <p className={styles.progressSub}>
              {progress.total} holding{progress.total === 1 ? "" : "s"}
            </p>
          </div>
        )}

        {status === "error" && (
          <div className={styles.intro}>
            <p className={styles.error}>
              Couldn&apos;t finish the portfolio review. Try again.
            </p>
            <RunButtons
              count={count}
              disabled={runDisabled || !configured}
              onRun={handleRun}
            />
          </div>
        )}

        {status === "done" && (
          <>
            <p className={styles.reviewMode}>
              {generatedAt
                ? `Analyzed ${new Date(generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} — same results as your daily email`
                : "Server review — same results as your daily email"}
            </p>

            <PortfolioHealthCard health={health} />

            <ToggleButtonGroup
              exclusive
              value={actionFilter}
              onChange={(_, next) => {
                if (next !== null) setActionFilter(next);
              }}
              sx={chipGroupSx}
              aria-label="Filter holdings by verdict"
            >
              {[
                { key: FILTERS.ALL, label: `All ${results.length}`, tone: null },
                { key: FILTERS.BUY, label: `${summary.BUY} Buy`, tone: "buy", show: summary.BUY > 0 },
                { key: FILTERS.HOLD, label: `${summary.HOLD} Hold`, show: summary.HOLD > 0 },
                { key: FILTERS.SELL, label: `${summary.SELL} Sell`, tone: "sell", show: summary.SELL > 0 },
                { key: FILTERS.FIRE, label: `${summary.FIRE} 🔥 Fire Sale`, tone: "fire", show: summary.FIRE > 0 },
                { key: FILTERS.CHANGED, label: `${summary.CHANGED} Changed`, show: summary.CHANGED > 0 },
                { key: FILTERS.FUND, label: `${summary.FUND} Fund${summary.FUND === 1 ? "" : "s"}`, show: summary.FUND > 0 },
                { key: FILTERS.NA, label: `${summary.NA} No data`, show: summary.NA > 0 },
              ]
                .filter((chip) => chip.key === FILTERS.ALL || chip.show)
                .map((chip) => (
                  <ToggleButton
                    key={chip.key}
                    value={chip.key}
                    disableRipple
                    sx={chipSx(chip.tone)}
                  >
                    {chip.label}
                  </ToggleButton>
                ))}
            </ToggleButtonGroup>

            <div className={styles.actions}>
              <Button
                variant="outlined"
                sx={secondaryBtnSx}
                onClick={handleRun}
                disabled={runDisabled}
              >
                Re-run analysis
              </Button>
            </div>

            <Button variant="outlined" sx={clearBtnSx} onClick={handleReset}>
              Clear results
            </Button>

            <div className={styles.list}>
              {filteredResults.length === 0 ? (
                <p className={styles.na}>No holdings match this filter.</p>
              ) : (
                filteredResults.map((item) => (
                  <PositionVerdictCard
                    key={item.symbol}
                    item={item}
                    onSelectSymbol={onSelectSymbol}
                  />
                ))
              )}
            </div>

            <p className={styles.disclaimer}>
              Automated summary from saved data on your device — for learning,
              not investment advice.
            </p>
          </>
        )}
      </div>
    </ResizableSidebar>
  );
}
