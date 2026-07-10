import { useEffect, useMemo, useRef, useState } from "react";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import ArticleIcon from "@mui/icons-material/Article";
import SouthEastIcon from "@mui/icons-material/SouthEast";
import BalanceIcon from "@mui/icons-material/Balance";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import PsychologyIcon from "@mui/icons-material/Psychology";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";

import { getVerdictContext } from "@stockjs/committee-engine/analyst/verdictContext.js";
import {
  getScoreSeries,
  summarizeScoreSeries,
} from "@stockjs/committee-engine/analyst/verdictHistory.js";
import { computePositionMetrics } from "../../utils/computePositionMetrics";
import { getGuardrail } from "@stockjs/committee-engine/guardrails.js";
import { getExitTimingAdvice } from "@stockjs/committee-engine/exitTimingAdvice.js";
import { whatToDo } from "@stockjs/committee-engine/actionAdvice.js";
import PositionHolding from "../PositionHolding/PositionHolding";
import CommitteeScoreChart from "../CommitteeScoreChart/CommitteeScoreChart";
import { getStockDataByDateRange } from "../../db";
import calculateRange from "../../utils/calculateRange";
import { isFundSymbol } from "@stockjs/committee-engine/isFundSymbol.js";
import { useRefreshSignal } from "../../hooks/useRefreshSignal";
import useServerCommittee from "../../hooks/useServerCommittee";
import styles from "./AnalystPanel.module.css";

// Compact primary action button used in the panel's empty/error states.
const naButtonSx = {
  padding: "6px 14px",
  fontSize: 12,
  minWidth: 0,
};

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

// Exit timing baked into every held SELL/REDUCE: it addresses both the
// held-a-while and held-recently cases automatically, reasoned from how the
// company's financials have done over the past year. Only rendered on SELL
// verdicts (see call site).
function ExitTiming({ verdict, pillars, metrics }) {
  const advice = getExitTimingAdvice({
    action: verdict.action,
    tier: verdict.tier,
    fundamentalScore: pillars?.fundamental,
    metrics,
  });
  if (!advice) return null;

  return (
    <div className={styles.horizon} role="note">
      <p className={styles.horizonHeadline}>{advice.headline}</p>
      {advice.lines.map((line) => (
        <p key={line} className={styles.horizonLine}>
          {line}
        </p>
      ))}
    </div>
  );
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

const fmtPrice = (n) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : "—";

const fmtShares = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, {
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
      })
    : "—";

// The Portfolio Manager's plan, as a beginner-readable box: what to actually
// do, at what prices. Entry plan for BUY, exit rationale for SELL, watch
// levels for HOLD.
function GamePlan({ plan, hasPosition, position, positionMetrics }) {
  if (!plan) return null;

  if (plan.kind === "entry") {
    return (
      <div className={styles.plan}>
        <div className={styles.planTitle}>
          Game plan {hasPosition ? "(if adding)" : "(if buying)"}
        </div>
        <div className={styles.planGrid}>
          <div className={styles.planItem}>
            <span className={styles.planLabel}>Buy near</span>
            <span className={styles.planValue}>{fmtPrice(plan.entry)}</span>
          </div>
          <div className={styles.planItem}>
            <span className={styles.planLabel}>Sell if it falls to</span>
            <span className={`${styles.planValue} ${styles.planNeg}`}>
              {fmtPrice(plan.stopPrice)}
            </span>
          </div>
          <div className={styles.planItem}>
            <span className={styles.planLabel}>Reassess near</span>
            <span className={`${styles.planValue} ${styles.planPos}`}>
              {fmtPrice(plan.targetPrice)}
            </span>
          </div>
          <div className={styles.planItem}>
            <span className={styles.planLabel}>Max position size</span>
            <span className={styles.planValue}>
              {plan.positionSizePct.toFixed(1)}% of portfolio
            </span>
          </div>
        </div>
        <p className={styles.planNote}>
          Sized so a wrong call costs at most ~
          {plan.portfolioRiskPct.toFixed(1)}% of your portfolio. This is a risk
          plan, not a trading plan: for a long-term position, the sell level is
          where the thesis breaks — above it, ignore daily noise — and the
          reassess level is a checkpoint to re-review, not an order to sell a
          winner.
        </p>
      </div>
    );
  }

  if (plan.kind === "exit") {
    // Translate the suggested trim percentage into this holder's actual
    // shares/dollars so "sell some" becomes a number they can act on.
    const quantity = position?.quantity;
    const hasSizing =
      hasPosition && Number.isFinite(plan.trimPct) && Number.isFinite(quantity);
    const sharesToSell = hasSizing ? (quantity * plan.trimPct) / 100 : null;
    const proceedsEstimate =
      hasSizing && Number.isFinite(positionMetrics?.lastPrice)
        ? sharesToSell * positionMetrics.lastPrice
        : null;

    return (
      <div className={styles.plan}>
        <div className={styles.planTitle}>
          {hasPosition ? "Why sell, and what next" : "Why stay away"}
        </div>
        {hasSizing && (
          <div className={styles.planGrid}>
            <div className={styles.planItem}>
              <span className={styles.planLabel}>Suggested amount</span>
              <span className={`${styles.planValue} ${styles.planNeg}`}>
                {plan.fullExit
                  ? "Sell all"
                  : `Sell ~${plan.trimPct}% of position`}
              </span>
            </div>
            <div className={styles.planItem}>
              <span className={styles.planLabel}>That's about</span>
              <span className={styles.planValue}>
                {fmtShares(sharesToSell)} of {fmtShares(quantity)} shares
                {Number.isFinite(proceedsEstimate)
                  ? ` (≈${fmtPrice(proceedsEstimate)})`
                  : ""}
              </span>
            </div>
          </div>
        )}
        {hasSizing && !plan.fullExit && (
          <p className={styles.planNote}>
            Sized to the committee's confidence: trim now, keep the rest, and
            reassess if the score keeps sliding or the price recovers.
          </p>
        )}
        <ul className={styles.planList}>
          {plan.reasons.slice(0, 4).map((r, i) => (
            <li key={i} className={styles.planReason}>
              {r}
            </li>
          ))}
        </ul>
        {Number.isFinite(plan.reclaimPrice) && (
          <p className={styles.planNote}>
            The committee would revisit this call above{" "}
            {fmtPrice(plan.reclaimPrice)} (its 50-day average). See the
            Portfolio Manager below for what to do with the proceeds.
          </p>
        )}
      </div>
    );
  }

  if (plan.kind === "watch" && (plan.upgradePrice || plan.downgradePrice)) {
    return (
      <div className={styles.plan}>
        <div className={styles.planTitle}>Levels to watch</div>
        <div className={styles.planGrid}>
          {Number.isFinite(plan.upgradePrice) && (
            <div className={styles.planItem}>
              <span className={styles.planLabel}>Improves above</span>
              <span className={`${styles.planValue} ${styles.planPos}`}>
                {fmtPrice(plan.upgradePrice)}
              </span>
            </div>
          )}
          {Number.isFinite(plan.downgradePrice) && (
            <div className={styles.planItem}>
              <span className={styles.planLabel}>Weakens below</span>
              <span className={`${styles.planValue} ${styles.planNeg}`}>
                {fmtPrice(plan.downgradePrice)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
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

// The server's news read on this symbol: mood line + the most-moving
// headlines from the FinBERT-scored archive (scored server-side; the same
// scores the daily email uses).
function ServerNewsIntelligence({ latest, articles }) {
  const links = [
    latest?.topPositive
      ? { label: "Most upbeat", ...latest.topPositive }
      : null,
    latest?.topNegative
      ? { label: "Most negative", ...latest.topNegative }
      : null,
  ].filter(Boolean);

  if (!latest?.newsMood && !links.length && !articles?.length) return null;

  return (
    <div className={styles.newsAgent}>
      <div className={styles.naHead}>
        <div className={styles.naTitle}>
          <PsychologyIcon sx={{ fontSize: 16 }} />
          News intelligence
        </div>
      </div>
      {latest?.newsMood && (
        <p className={styles.naCoverage}>{latest.newsMood}</p>
      )}
      {links.length > 0 && (
        <ul className={styles.findingList}>
          {links.map((l) => (
            <li key={l.label} className={`${styles.finding} ${styles.neutral}`}>
              <span className={styles.findingDot} />
              {l.label}:{" "}
              <a
                href={l.link}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.findingLink}
              >
                {l.title}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.naResult}>
        Articles are crawled and scored with FinBERT on the server — the same
        scores behind your daily email.
      </p>
    </div>
  );
}

function fmtGeneratedAt(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

export default function AnalystPanel({
  symbol,
  position,
  positionsLoading = false,
  onOpenSyncSetup,
  compact = false,
}) {
  // Verdicts come from the server (single source of truth — the same stored
  // run that feeds the daily email and the portfolio panel).
  const committee = useServerCommittee(symbol);

  // Candles stay a local concern: the position card's P/L math and the local
  // fund fast-path read whatever the chart already cached in IndexedDB.
  const [yearCandles, setYearCandles] = useState([]);
  const loadedSymbolRef = useRef(null);
  const refreshVersion = useRefreshSignal(symbol);
  useEffect(() => {
    if (!symbol) {
      loadedSymbolRef.current = null;
      setYearCandles([]);
      return undefined;
    }
    let active = true;
    if (loadedSymbolRef.current !== symbol) {
      loadedSymbolRef.current = symbol;
    }
    const { startDate, endDate } = calculateRange(365);
    getStockDataByDateRange(symbol, startDate, endDate)
      .then((rows) => {
        if (active) setYearCandles(rows || []);
      })
      .catch(() => {
        if (active) setYearCandles([]);
      });
    return () => {
      active = false;
    };
  }, [symbol, refreshVersion]);

  const latest = committee.row?.latest ?? null;
  const report = latest?.report ?? null;
  const tierChange = latest?.tierChange ?? null;

  // Fund detection: trust the server verdict when we have one; otherwise the
  // local candles give an instant answer without a server round-trip.
  const isFund = useMemo(
    () => (latest ? Boolean(latest.isFund) : isFundSymbol(yearCandles)),
    [latest, yearCandles],
  );

  const scoreSeries = useMemo(
    () => getScoreSeries(committee.row?.history ?? []),
    [committee.row],
  );

  const scoreTrend = useMemo(
    () => summarizeScoreSeries(scoreSeries),
    [scoreSeries],
  );

  const positionMetrics = useMemo(
    () => (position ? computePositionMetrics(position, yearCandles) : null),
    [position, yearCandles],
  );

  const guardrail = useMemo(
    () =>
      report && positionMetrics ? getGuardrail(report, positionMetrics) : null,
    [report, positionMetrics],
  );

  if (isFund) {
    return (
      <div className={styles.empty}>
        The AI Committee analyzes individual companies. {symbol} is a fund or
        ETF — its price tracks a basket of holdings, so company financials,
        earnings, and a single buy/hold/sell verdict don&apos;t apply.
      </div>
    );
  }

  if (committee.status === "unconfigured") {
    return (
      <div className={styles.empty}>
        <p>
          The AI Committee runs on the server so this panel, the portfolio
          review, and your daily email always agree. Set up the email report
          first, then come back here.
        </p>
        {onOpenSyncSetup && (
          <Button
            variant="contained"
            color="primary"
            sx={naButtonSx}
            onClick={onOpenSyncSetup}
            startIcon={<EmailOutlinedIcon sx={{ fontSize: 15 }} />}
          >
            Set up email report
          </Button>
        )}
      </div>
    );
  }

  if (committee.status === "loading" || positionsLoading) {
    return (
      <div className={styles.loading}>
        <CircularProgress size={24} />
      </div>
    );
  }

  if (committee.status === "running") {
    return (
      <div className={styles.loading}>
        <CircularProgress size={24} />
        <p className={styles.empty}>
          Analyzing {symbol} on the server — first run can take a minute…
        </p>
      </div>
    );
  }

  if (committee.status === "norun" || committee.status === "error" || !report) {
    return (
      <div className={styles.empty}>
        {committee.status === "error" ? (
          <p>Committee run failed: {committee.error}</p>
        ) : (
          <p>No stored verdict for {symbol} yet.</p>
        )}
        <Button
          variant="contained"
          color="primary"
          sx={naButtonSx}
          onClick={committee.run}
          startIcon={<AutoAwesomeIcon sx={{ fontSize: 15 }} />}
        >
          Run committee on server
        </Button>
      </div>
    );
  }

  const { verdict, pillars, agents } = report;
  const portfolioManager = agents.find((a) => a.key === "portfolioManager");
  const verdictContext = getVerdictContext(verdict.action, {
    hasPosition: Boolean(position),
    tier: verdict.tier,
    fireSale: verdict.fireSale,
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
            <div className={styles.verdictAction}>
              {verdict.tier ?? verdict.action}
              {verdict.fireSale && (
                <span
                  className={styles.fireBadge}
                  title={`Finances score ${fmtScore(verdict.fireSale.fundamental)}/100 while the stock sits ${fmtScore(verdict.fireSale.offHighPct)}% below its 52-week high — priced low with room to bounce back. Full reasoning is in the Portfolio Manager card below.`}
                >
                  🔥 FIRE SALE
                  {verdict.fireSale.confidenceLabel
                    ? ` · ${verdict.fireSale.confidenceLabel}`
                    : ""}
                </span>
              )}
              {tierChange && (
                <span
                  className={`${styles.tierChange} ${
                    tierChange.direction === "upgrade"
                      ? styles.tierChangeUp
                      : styles.tierChangeDown
                  }`}
                >
                  {tierChange.direction === "upgrade" ? "↑" : "↓"} was{" "}
                  {tierChange.fromTier} ({tierChange.fromComposite.toFixed(0)})
                  on {tierChange.fromDay}
                </span>
              )}
            </div>
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

      {!compact && portfolioManager?.narrative && (
        <p className={styles.verdictNarrative}>{portfolioManager.narrative}</p>
      )}

      {!compact && portfolioManager && (
        <p className={styles.whatToDo}>
          <strong>What to do:</strong>{" "}
          {whatToDo({
            action: verdict.action,
            tier: verdict.tier,
            plan: portfolioManager.plan,
          })}
        </p>
      )}

      {position && (
        <PositionHolding
          position={position}
          metrics={positionMetrics}
          compact={compact}
        />
      )}

      {guardrail && (
        <div className={styles.guardrail} role="note">
          <WarningAmberIcon className={styles.guardrailIcon} />
          <span>{guardrail.text}</span>
        </div>
      )}

      {position && verdict.action === "SELL" && (
        <ExitTiming
          verdict={verdict}
          pillars={pillars}
          metrics={report.metrics}
        />
      )}

      <GamePlan
        plan={portfolioManager?.plan}
        hasPosition={Boolean(position)}
        position={position}
        positionMetrics={positionMetrics}
      />

      {/* Pillars */}
      <div
        className={`${styles.pillars} ${compact ? styles.pillarsCompact : ""}`}
      >
        <PillarBar label="Price trend" score={pillars.technical} />
        <PillarBar label="Company finances" score={pillars.fundamental} />
        <PillarBar label="News mood" score={pillars.sentiment} />
      </div>

      {/* Committee score over time (thesis tracking) */}
      {scoreSeries.length >= 3 && (
        <div className={styles.scoreHistory}>
          <div className={styles.scoreHistoryHead}>
            <span className={styles.scoreHistoryLabel}>
              Committee score over time
            </span>
            <span className={styles.scoreHistoryRange}>
              {scoreSeries[0].day} → today
            </span>
          </div>
          <CommitteeScoreChart series={scoreSeries} height={128} />
          {scoreTrend && (
            <p className={styles.scoreHistoryAnalysis}>{scoreTrend.text}</p>
          )}
        </div>
      )}

      {/* Server news read (FinBERT-scored archive) */}
      <ServerNewsIntelligence
        latest={latest}
        articles={committee.row?.articles}
      />

      {/* Committee transcript */}
      <div className={styles.committee}>
        <div className={styles.committeeLabel}>Committee review</div>
        {agents.map((agent) => (
          <AgentCard key={agent.key} agent={agent} />
        ))}
      </div>

      <div className={styles.naHead}>
        <p className={styles.naResult}>
          {fmtGeneratedAt(latest?.generatedAt)
            ? `Analyzed ${fmtGeneratedAt(latest.generatedAt)} — same result as your daily email.`
            : "Same result as your daily email."}
        </p>
        <Button
          variant="contained"
          color="primary"
          sx={naButtonSx}
          onClick={committee.run}
          startIcon={<AutoAwesomeIcon sx={{ fontSize: 15 }} />}
        >
          Re-run
        </Button>
      </div>

      <p className={styles.disclaimer}>
        This is an automated summary computed on the server from price,
        company-financial, and news data — it&apos;s for learning, not
        investment advice.
      </p>
    </div>
  );
}
