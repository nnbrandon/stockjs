import { useEffect, useMemo, useState } from "react";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import ArticleIcon from "@mui/icons-material/Article";
import SouthEastIcon from "@mui/icons-material/SouthEast";
import BalanceIcon from "@mui/icons-material/Balance";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PsychologyIcon from "@mui/icons-material/Psychology";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CircularProgress from "@mui/material/CircularProgress";

import { runAnalystCommittee } from "../../utils/analyst";
import { getVerdictContext } from "../../utils/analyst/verdictContext";
import { computePositionMetrics } from "../../utils/computePositionMetrics";
import PositionHolding from "../PositionHolding/PositionHolding";
import { getStockDataByDateRange } from "../../db";
import calculateRange from "../../utils/calculateRange";
import { isFundSymbol } from "../../utils/isFundSymbol";
import { useRefreshSignal } from "../../hooks/useRefreshSignal";
import useNewsIntelligence from "../../hooks/useNewsIntelligence";
import useFinbert from "../../hooks/useFinbert";
import styles from "./AnalystPanel.module.css";

const AGENT_ICONS = {
  dataScout: TravelExploreIcon,
  sentiment: ArticleIcon,
  bear: SouthEastIcon,
  devil: BalanceIcon,
  portfolioManager: AccountBalanceWalletIcon,
};

const fmtScore = (n) => (Number.isFinite(n) ? n.toFixed(0) : "—");

function actionClass(action) {
  if (action === "BUY") return styles.buy;
  if (action === "SELL") return styles.sell;
  return styles.hold;
}

function PillarBar({ label, score }) {
  const value = Number.isFinite(score) ? score : null;
  const tone =
    value == null ? "na" : value >= 58 ? "pos" : value >= 42 ? "mid" : "neg";
  return (
    <div className={styles.pillar}>
      <div className={styles.pillarHead}>
        <span className={styles.pillarLabel}>{label}</span>
        <span className={styles.pillarScore}>
          {value == null ? "n/a" : `${value.toFixed(0)}`}
        </span>
      </div>
      <div className={styles.pillarTrack}>
        <div
          className={`${styles.pillarFill} ${styles[`tone_${tone}`]}`}
          style={{ width: `${value == null ? 0 : value}%` }}
        />
      </div>
    </div>
  );
}

function findingClass(polarity) {
  if (polarity === "bull") return styles.bull;
  if (polarity === "bear") return styles.bear;
  return styles.neutral;
}

function FindingText({ finding }) {
  if (finding.link && finding.linkText) {
    return (
      <>
        {finding.text}
        <a
          href={finding.link}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.findingLink}
        >
          &ldquo;{finding.linkText}&rdquo;
        </a>
      </>
    );
  }

  return finding.text;
}

function AgentCard({ agent }) {
  const Icon = AGENT_ICONS[agent.key] || ArticleIcon;

  // Score chip text differs for the special agents.
  let chip = null;
  if (agent.key === "portfolioManager") {
    chip = `${agent.tier} · ${agent.convictionLabel} confidence`;
  } else if (agent.key === "devil") {
    chip = `-${agent.confidencePenalty?.toFixed(0) ?? 0} confidence`;
  } else if (agent.key === "bear") {
    chip = `concern ${fmtScore(agent.score)}/100`;
  } else if (Number.isFinite(agent.score)) {
    chip = `${fmtScore(agent.score)}/100 · ${agent.stance}`;
  } else {
    chip = agent.stance;
  }

  return (
    <div className={styles.agentCard}>
      <div className={styles.agentHead}>
        <div className={styles.agentIcon}>
          <Icon fontSize="small" />
        </div>
        <div className={styles.agentTitle}>
          <span className={styles.agentName}>{agent.name}</span>
          <span className={styles.agentRole}>{agent.role}</span>
        </div>
        <span className={styles.agentChip}>{chip}</span>
      </div>
      <p className={styles.agentSummary}>{agent.summary}</p>
      {agent.findings?.length > 0 && (
        <ul className={styles.findingList}>
          {agent.findings.map((f, i) => (
            <li
              key={i}
              className={`${styles.finding} ${findingClass(f.polarity)}`}
            >
              <span className={styles.findingDot} />
              <FindingText finding={f} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StepIcon({ status }) {
  if (status === "running")
    return (
      <CircularProgress
        size={14}
        thickness={6}
        className={styles.stepSpinner}
      />
    );
  if (status === "done")
    return (
      <CheckCircleIcon className={styles.stepDone} sx={{ fontSize: 15 }} />
    );
  return <span className={styles.stepPending} />;
}

function FinbertStatus({ finbert }) {
  const { status, modelProgress, scoreProgress, error } = finbert;

  // "done" is covered by the per-run result line; "idle" shows nothing.
  if (status === "idle" || status === "done") return null;

  let text;
  if (status === "loading")
    text = `Loading FinBERT model… ${Math.round(modelProgress * 100)}% (one-time download, then cached)`;
  else if (status === "scoring")
    text = `Scoring articles… ${scoreProgress.done}/${scoreProgress.total}`;
  else if (status === "error")
    text = `FinBERT unavailable (${error || "load failed"}). Using lexicon scores instead.`;

  const busy = status === "loading" || status === "scoring";
  return (
    <p className={status === "error" ? styles.naError : styles.naResult}>
      {busy && (
        <CircularProgress
          size={12}
          thickness={6}
          className={styles.stepSpinner}
          sx={{ mr: 0.75, verticalAlign: "middle" }}
        />
      )}
      {text}
    </p>
  );
}

function NewsIntelligence({ symbol, news, finbert }) {
  const { run, status, steps, stats, count, pending } = useNewsIntelligence({
    symbol,
    news,
    finbert,
  });

  const totalArticles = news?.length || 0;
  const running =
    status === "running" ||
    finbert.status === "loading" ||
    finbert.status === "scoring";
  const allCached = count > 0 && pending === 0;

  const buttonLabel = running
    ? "Analyzing…"
    : allCached
      ? "Re-analyze"
      : `Analyze ${pending || count} with FinBERT`;

  return (
    <div className={styles.newsAgent}>
      <div className={styles.naHead}>
        <div className={styles.naTitle}>
          <PsychologyIcon sx={{ fontSize: 16 }} />
          News intelligence agent
        </div>
        <button
          type="button"
          className={styles.naButton}
          onClick={() => run(allCached)}
          disabled={running || !symbol || count === 0}
        >
          <AutoAwesomeIcon sx={{ fontSize: 15, mr: 0.5 }} />
          {buttonLabel}
        </button>
      </div>

      <p className={styles.naCoverage}>
        {totalArticles === 0
          ? "No cached articles."
          : allCached
            ? `All ${count} article${count === 1 ? "" : "s"} already scored by FinBERT (cached). Re-analyze to refresh.`
            : `Crawls each article's full text and scores it with FinBERT (on-device neural model). Analyzing ${count} of ${totalArticles} cached article${totalArticles === 1 ? "" : "s"}${totalArticles > 20 ? " (the last 30 days)" : ""}.`}
      </p>

      <FinbertStatus finbert={finbert} />

      {steps.length > 0 && (
        <ol className={styles.stepList}>
          {steps.map((step) => (
            <li key={step.id} className={styles.step}>
              <StepIcon status={step.status} />
              <div className={styles.stepBody}>
                <span className={styles.stepLabel}>{step.label}</span>
                {step.detail && (
                  <span className={styles.stepDetail}>{step.detail}</span>
                )}
              </div>
              {step.progress && step.status === "running" && (
                <span className={styles.stepProgress}>
                  {step.progress.done}/{step.progress.total}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {status === "done" && stats && finbert.status !== "loading" && (
        <p className={styles.naResult}>
          {stats.scored === 0
            ? `Using cached FinBERT scores (${stats.cached ?? count} article${(stats.cached ?? count) === 1 ? "" : "s"}). No re-run needed.`
            : `${
                stats.requested > 0
                  ? `Crawled ${stats.fetched}/${stats.requested} new article${stats.requested === 1 ? "" : "s"}${stats.failed > 0 ? ` · ${stats.failed} blocked/paywalled` : ""}. `
                  : ""
              }Scored ${stats.scored} with FinBERT${stats.cached ? ` (${stats.cached} cached)` : ""}. Committee re-scored.`}
        </p>
      )}
      {status === "error" && (
        <p className={styles.naError}>
          Couldn&apos;t reach the extraction service. Try again.
        </p>
      )}
    </div>
  );
}

export default function AnalystPanel({
  symbol,
  quarterly,
  annual,
  earnings,
  news,
  position,
  positionsLoading = false,
  supplementalDataReady = false,
  compact = false,
}) {
  const finbert = useFinbert();

  // The committee always evaluates a fixed 1-year window, independent of the
  // chart's selected range — so the verdict is consistent no matter what range
  // the user is viewing. Loaded straight from IndexedDB (whatever is cached).
  const [yearCandles, setYearCandles] = useState([]);
  const [yearCandlesReady, setYearCandlesReady] = useState(false);
  const refreshVersion = useRefreshSignal(symbol);
  useEffect(() => {
    if (!symbol) {
      setYearCandles([]);
      setYearCandlesReady(false);
      return undefined;
    }
    let active = true;
    setYearCandlesReady(false);
    const { startDate, endDate } = calculateRange(365);
    getStockDataByDateRange(symbol, startDate, endDate)
      .then((rows) => {
        if (!active) return;
        setYearCandles(rows || []);
      })
      .catch(() => {
        if (!active) return;
        setYearCandles([]);
      })
      .finally(() => {
        if (active) setYearCandlesReady(true);
      });
    return () => {
      active = false;
    };
  }, [symbol, refreshVersion]);

  const committeeInputsReady =
    yearCandlesReady && supplementalDataReady && !positionsLoading;

  // Funds/ETFs/indexes have no company financials, so the committee can't
  // produce a meaningful verdict — skip it (see isFundSymbol).
  const isFund = useMemo(() => isFundSymbol(yearCandles), [yearCandles]);

  // Merge any FinBERT per-article scores into the news so the committee
  // re-scores on neural sentiment instead of the lexicon fallback.
  const mergedNews = useMemo(() => {
    const scores = finbert.scores;
    if (!news?.length || !Object.keys(scores).length) return news;
    return news.map((n) => (scores[n.id] ? { ...n, model: scores[n.id] } : n));
  }, [news, finbert.scores]);

  const report = useMemo(
    () =>
      runAnalystCommittee({
        symbol,
        chartData: yearCandles,
        quarterly,
        annual,
        earnings,
        news: mergedNews,
      }),
    [symbol, yearCandles, quarterly, annual, earnings, mergedNews],
  );

  const positionMetrics = useMemo(
    () =>
      position ? computePositionMetrics(position, yearCandles) : null,
    [position, yearCandles],
  );

  if (!committeeInputsReady) {
    return (
      <div className={styles.loading}>
        <CircularProgress size={24} />
      </div>
    );
  }

  if (isFund) {
    return (
      <div className={styles.empty}>
        The AI Committee analyzes individual companies. {symbol} is a fund or
        ETF — its price tracks a basket of holdings, so company financials,
        earnings, and a single buy/hold/sell verdict don&apos;t apply.
      </div>
    );
  }

  if (!report) {
    return (
      <div className={styles.empty}>
        Not enough cached data to run the committee yet.
      </div>
    );
  }

  const { verdict, pillars, agents } = report;
  const verdictContext = getVerdictContext(verdict.action, {
    hasPosition: Boolean(position),
  });
  const VerdictIcon =
    verdict.action === "BUY"
      ? TrendingUpIcon
      : verdict.action === "SELL"
        ? SouthEastIcon
        : TrendingFlatIcon;

  return (
    <div className={`${styles.panel} ${compact ? styles.panelCompact : ""}`}>
      {/* Verdict banner */}
      <div
        className={`${styles.verdict} ${compact ? styles.verdictCompact : ""} ${actionClass(verdict.action)}`}
      >
        <div className={styles.verdictMain}>
          <VerdictIcon className={styles.verdictIcon} />
          <div>
            <div className={styles.verdictAction}>{verdict.action}</div>
            <p className={styles.verdictContext}>{verdictContext}</p>
          </div>
        </div>
        <div className={styles.verdictMeta}>
          <div className={styles.verdictScore}>
            <span className={styles.verdictScoreValue}>
              {fmtScore(verdict.composite)}
            </span>
            <span className={styles.verdictScoreMax}>/100</span>
          </div>
          <div className={styles.verdictConviction}>
            {verdict.convictionLabel} confidence
          </div>
        </div>
      </div>

      {position && (
        <PositionHolding
          position={position}
          metrics={positionMetrics}
          compact={compact}
        />
      )}

      {/* Pillars */}
      <div
        className={`${styles.pillars} ${compact ? styles.pillarsCompact : ""}`}
      >
        <PillarBar label="Price trend" score={pillars.technical} />
        <PillarBar label="Company finances" score={pillars.fundamental} />
        <PillarBar label="News mood" score={pillars.sentiment} />
      </div>

      {/* News enrichment agent */}
      <NewsIntelligence symbol={symbol} news={news} finbert={finbert} />

      {/* Committee transcript */}
      <div className={styles.committee}>
        <div className={styles.committeeLabel}>Committee review</div>
        {agents.map((agent) => (
          <AgentCard key={agent.key} agent={agent} />
        ))}
      </div>

      <p className={styles.disclaimer}>
        This is an automated summary worked out on your device from saved price,
        company-financial, and news data — it&apos;s for learning, not
        investment advice.
      </p>
    </div>
  );
}
