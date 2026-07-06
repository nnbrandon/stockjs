import { useMemo, useState } from "react";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PsychologyIcon from "@mui/icons-material/Psychology";
import CircularProgress from "@mui/material/CircularProgress";

import AiCommitteeHelpButton from "../AiCommitteeHelp/AiCommitteeHelpButton";
import ResizableSidebar from "../ResizableSidebar/ResizableSidebar";
import { usePortfolioCommitteeContext } from "./PortfolioCommitteeProvider";
import { getVerdictContext } from "../../utils/analyst/verdictContext";
import styles from "./PortfolioCommitteePanel.module.css";

const FILTERS = {
  ALL: "ALL",
  BUY: "BUY",
  HOLD: "HOLD",
  SELL: "SELL",
  FUND: "FUND",
  NA: "NA",
};

const fmtScore = (n) => (Number.isFinite(n) ? n.toFixed(0) : "—");

function getItemFilterKey(item) {
  if (item.isFund) return FILTERS.FUND;
  const action = item.report?.verdict?.action;
  if (action === "BUY" || action === "HOLD" || action === "SELL") return action;
  return FILTERS.NA;
}

function actionClass(action) {
  if (action === "BUY") return styles.actionBuy;
  if (action === "SELL") return styles.actionSell;
  return styles.actionHold;
}

function progressLabel(progress, finbert) {
  if (progress.phase === "load") {
    return progress.detail || "Loading cached data for all holdings…";
  }

  if (progress.phase === "news") {
    if (finbert?.status === "loading") {
      return `Loading FinBERT model… ${Math.round((finbert.modelProgress || 0) * 100)}%`;
    }
    if (finbert?.status === "scoring") {
      const { done, total } = finbert.scoreProgress || {};
      if (total > 0) {
        return `Scoring articles with FinBERT (${done}/${total})`;
      }
    }
    return progress.detail || "Scoring news articles with FinBERT…";
  }

  return (
    <>
      Analyzing {progress.done + 1} of {progress.total}
      {progress.symbol && (
        <>
          {" "}
          — <span className={styles.progressSymbol}>{progress.symbol}</span>
        </>
      )}
    </>
  );
}

function RunButtons({ count, disabled, onQuick, onDeep }) {
  return (
    <div className={styles.runActions}>
      <button
        type="button"
        className={styles.runBtn}
        onClick={onQuick}
        disabled={disabled}
      >
        <AutoAwesomeIcon fontSize="small" />
        Quick review ({count})
      </button>
      <button
        type="button"
        className={`${styles.runBtn} ${styles.runBtnDeep}`}
        onClick={onDeep}
        disabled={disabled}
      >
        <PsychologyIcon fontSize="small" />
        Deep review ({count})
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
  const context = getVerdictContext(verdict.action, {
    hasPosition: true,
    tier: verdict.tier,
  });

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
  const { finbert, status, results, progress, reviewMode, run, reset, count } =
    usePortfolioCommitteeContext();

  const runDisabled = positionsLoading || count === 0 || status === "running";

  const summary = useMemo(() => {
    const counts = { BUY: 0, HOLD: 0, SELL: 0, FUND: 0, NA: 0 };
    for (const item of results) {
      counts[getItemFilterKey(item)] += 1;
    }
    return counts;
  }, [results]);

  const filteredResults = useMemo(() => {
    if (actionFilter === FILTERS.ALL) return results;
    return results.filter((item) => getItemFilterKey(item) === actionFilter);
  }, [results, actionFilter]);

  const handleRunQuick = () => {
    setActionFilter(FILTERS.ALL);
    run({ deep: false });
  };

  const handleRunDeep = () => {
    setActionFilter(FILTERS.ALL);
    run({ deep: true, finbert });
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
              Run an on-device review of every portfolio holding — price trend,
              company finances, and news — with a buy/hold/sell call for each
              position.
            </p>
            <RunButtons
              count={count}
              disabled={runDisabled}
              onQuick={handleRunQuick}
              onDeep={handleRunDeep}
            />
            <p className={styles.introText}>
              Quick review uses already-scored news from cache. Deep review
              batches article crawling and FinBERT scoring across all holdings
              (one model load, one scoring pass), then runs the committee per
              ticker — much slower, but more complete.
            </p>
          </div>
        )}

        {status === "running" && (
          <div className={styles.progress}>
            <CircularProgress size={28} />
            <p className={styles.progressText}>
              {progressLabel(progress, finbert)}
            </p>
            {progress.phase === "committee" && (
              <p className={styles.progressSub}>
                Holding {progress.done + 1} of {progress.total}
              </p>
            )}
            {progress.phase === "news" && progress.articlesTotal > 0 && (
              <p className={styles.progressSub}>
                Batched across {progress.total} holdings
              </p>
            )}
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
              onQuick={handleRunQuick}
              onDeep={handleRunDeep}
            />
          </div>
        )}

        {status === "done" && (
          <>
            {reviewMode && (
              <p className={styles.reviewMode}>
                {reviewMode === "deep"
                  ? "Deep review — news scored with FinBERT"
                  : "Quick review — used cached news scores"}
              </p>
            )}

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
                onClick={handleRunQuick}
                disabled={runDisabled}
              >
                Re-run quick
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleRunDeep}
                disabled={runDisabled}
              >
                Re-run deep
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
