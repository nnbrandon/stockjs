import { useMemo, useState } from "react";
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
import styles from "./PortfolioCommitteePanel.module.css";

const FILTERS = {
  ALL: "ALL",
  BUY: "BUY",
  HOLD: "HOLD",
  SELL: "SELL",
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
      <button
        type="button"
        className={styles.runBtn}
        onClick={onRun}
        disabled={disabled}
      >
        <AutoAwesomeIcon fontSize="small" />
        Run committee ({count})
      </button>
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
          <button
            type="button"
            className={styles.openBtn}
            onClick={() => onSelectSymbol(symbol)}
          >
            Open chart
          </button>
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
          <button
            type="button"
            className={styles.openBtn}
            onClick={() => onSelectSymbol(symbol)}
          >
            Open chart
          </button>
        </div>
      </div>
    );
  }

  const { verdict, pillars } = report;
  const tierChange = getItemTierChange(item);
  const context = getVerdictContext(verdict.action, {
    hasPosition: true,
    tier: verdict.tier,
  });

  // For SELL verdicts, surface the Portfolio Manager's suggested trim size in
  // this holder's actual shares/dollars.
  const exitPlan =
    verdict.action === "SELL"
      ? report.agents?.find((a) => a.key === "portfolioManager")?.plan
      : null;
  const quantity = item.position?.quantity;
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
        <p className={styles.context}>{context}</p>

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
          <button
            type="button"
            className={styles.openBtn}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide scores" : "Show scores"}
          </button>
          <button
            type="button"
            className={styles.openBtn}
            onClick={() => onSelectSymbol(symbol, { openCommittee: true })}
          >
            Open full committee
          </button>
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
    run,
    reset,
    count,
    configured,
  } = usePortfolioCommitteeContext();

  const runDisabled = positionsLoading || count === 0 || status === "running";

  const summary = useMemo(() => {
    const counts = { BUY: 0, HOLD: 0, SELL: 0, FUND: 0, NA: 0, CHANGED: 0 };
    for (const item of results) {
      counts[getItemFilterKey(item)] += 1;
      if (getItemTierChange(item)) counts.CHANGED += 1;
    }
    return counts;
  }, [results]);

  const filteredResults = useMemo(() => {
    if (actionFilter === FILTERS.ALL) return results;
    if (actionFilter === FILTERS.CHANGED)
      return results.filter((item) => getItemTierChange(item));
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

  const filterChipClass = (filter, tone) => {
    const classes = [styles.summaryChip];
    if (tone === "buy") classes.push(styles.summaryChipBuy);
    if (tone === "sell") classes.push(styles.summaryChipSell);
    if (actionFilter === filter) classes.push(styles.summaryChipActive);
    return classes.join(" ");
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
        <button
          type="button"
          className={styles.expandBtn}
          onClick={() => setCollapsed(false)}
          aria-label="Expand portfolio committee panel"
        >
          <ChevronLeftIcon fontSize="small" />
        </button>
      }
    >
      <div className={styles.toolbar}>
        <span className={styles.title}>AI Committee</span>
        <div className={styles.toolbarActions}>
          <AiCommitteeHelpButton className={styles.helpBtn} />
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => setCollapsed(true)}
            aria-label="Collapse portfolio committee panel"
          >
            <ChevronRightIcon fontSize="small" />
          </button>
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
              disabled={runDisabled}
              onRun={handleRun}
            />
          </div>
        )}

        {status === "done" && (
          <>
            <p className={styles.reviewMode}>
              Server review — same run as your daily email
            </p>

            <PortfolioHealthCard health={health} />

            <div className={styles.summary}>
              <button
                type="button"
                className={filterChipClass(FILTERS.ALL)}
                onClick={() => setActionFilter(FILTERS.ALL)}
                aria-pressed={actionFilter === FILTERS.ALL}
              >
                All {results.length}
              </button>
              {summary.BUY > 0 && (
                <button
                  type="button"
                  className={filterChipClass(FILTERS.BUY, "buy")}
                  onClick={() => setActionFilter(FILTERS.BUY)}
                  aria-pressed={actionFilter === FILTERS.BUY}
                >
                  {summary.BUY} Buy
                </button>
              )}
              {summary.HOLD > 0 && (
                <button
                  type="button"
                  className={filterChipClass(FILTERS.HOLD)}
                  onClick={() => setActionFilter(FILTERS.HOLD)}
                  aria-pressed={actionFilter === FILTERS.HOLD}
                >
                  {summary.HOLD} Hold
                </button>
              )}
              {summary.SELL > 0 && (
                <button
                  type="button"
                  className={filterChipClass(FILTERS.SELL, "sell")}
                  onClick={() => setActionFilter(FILTERS.SELL)}
                  aria-pressed={actionFilter === FILTERS.SELL}
                >
                  {summary.SELL} Sell
                </button>
              )}
              {summary.CHANGED > 0 && (
                <button
                  type="button"
                  className={filterChipClass(FILTERS.CHANGED)}
                  onClick={() => setActionFilter(FILTERS.CHANGED)}
                  aria-pressed={actionFilter === FILTERS.CHANGED}
                >
                  {summary.CHANGED} Changed
                </button>
              )}
              {summary.FUND > 0 && (
                <button
                  type="button"
                  className={filterChipClass(FILTERS.FUND)}
                  onClick={() => setActionFilter(FILTERS.FUND)}
                  aria-pressed={actionFilter === FILTERS.FUND}
                >
                  {summary.FUND} Fund{summary.FUND === 1 ? "" : "s"}
                </button>
              )}
              {summary.NA > 0 && (
                <button
                  type="button"
                  className={filterChipClass(FILTERS.NA)}
                  onClick={() => setActionFilter(FILTERS.NA)}
                  aria-pressed={actionFilter === FILTERS.NA}
                >
                  {summary.NA} No data
                </button>
              )}
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleRun}
                disabled={runDisabled}
              >
                Re-run analysis
              </button>
            </div>

            <button
              type="button"
              className={styles.clearBtn}
              onClick={handleReset}
            >
              Clear results
            </button>

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
