import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COMMITTEE_ENGINE_VERSION,
  runAnalystCommittee,
} from "../utils/analyst";
import { saveCommitteeSnapshot } from "../db";
import { getPreviousSnapshot } from "../utils/analyst/verdictHistory";
import { analyzePortfolioHealth } from "../utils/portfolioHealth";
import { computePositionMetrics } from "../utils/computePositionMetrics";
import { loadCommitteeData } from "../utils/loadCommitteeData";
import { isFundSymbol } from "../utils/isFundSymbol";
import { isTradeableTickerSymbol } from "../utils/parseFidelityCsv";
import { scorePortfolioNews } from "../utils/scorePortfolioNews";

/** Session-only cache — survives in-app navigation, cleared on page refresh. */
let sessionCache = null;

function buildPositionKey(positions) {
  return positions
    .map((p) => p.symbol)
    .sort()
    .join("|");
}

function readSession(positionKey) {
  if (!sessionCache || sessionCache.positionKey !== positionKey) return null;
  return sessionCache;
}

function writeSession(positionKey, results, reviewMode, health) {
  sessionCache = { positionKey, status: "done", results, reviewMode, health };
}

function clearSession() {
  sessionCache = null;
}

function initialState(positionKey) {
  const session = readSession(positionKey);
  if (session?.status === "done") {
    return {
      status: "done",
      results: session.results,
      reviewMode: session.reviewMode ?? "quick",
      health: session.health ?? null,
    };
  }
  return { status: "idle", results: [], reviewMode: null, health: null };
}

export default function usePortfolioCommittee(positions) {
  const tradeablePositions = useMemo(
    () => positions.filter((p) => isTradeableTickerSymbol(p.symbol)),
    [positions],
  );

  const positionKey = useMemo(
    () => buildPositionKey(tradeablePositions),
    [tradeablePositions],
  );

  const [status, setStatus] = useState(
    () => initialState(positionKey).status,
  );
  const [results, setResults] = useState(
    () => initialState(positionKey).results,
  );
  const [reviewMode, setReviewMode] = useState(
    () => initialState(positionKey).reviewMode,
  );
  const [health, setHealth] = useState(() => initialState(positionKey).health);
  const [progress, setProgress] = useState({
    done: 0,
    total: 0,
    symbol: null,
    phase: "committee",
    detail: null,
  });

  useEffect(() => {
    const session = readSession(positionKey);
    if (session?.status === "done") {
      setStatus("done");
      setResults(session.results);
      setReviewMode(session.reviewMode ?? "quick");
      setHealth(session.health ?? null);
    } else {
      setStatus("idle");
      setResults([]);
      setReviewMode(null);
      setHealth(null);
    }
  }, [positionKey]);

  const run = useCallback(
    async ({ deep = false, finbert } = {}) => {
      if (!tradeablePositions.length) return;
      if (deep && !finbert?.run) return;

      const mode = deep ? "deep" : "quick";
      setReviewMode(mode);
      setStatus("running");
      setResults([]);
      setProgress({
        done: 0,
        total: tradeablePositions.length,
        symbol: null,
        phase: deep ? "news" : "committee",
        detail: null,
      });

      const out = [];
      const key = buildPositionKey(tradeablePositions);
      try {
        setProgress({
          done: 0,
          total: tradeablePositions.length,
          symbol: null,
          phase: deep ? "load" : "committee",
          detail: deep ? "Loading cached data for all holdings…" : null,
        });

        const dataBySymbol = Object.fromEntries(
          await Promise.all(
            tradeablePositions.map(async (position) => {
              const data = await loadCommitteeData(position.symbol);
              return [position.symbol, data];
            }),
          ),
        );

        // Funds/ETFs/indexes have no company financials — exclude them from
        // both committee scoring and (deep) news crawling.
        const fundSymbols = new Set(
          tradeablePositions
            .filter((p) => isFundSymbol(dataBySymbol[p.symbol]?.chartData))
            .map((p) => p.symbol),
        );

        let newsBySymbol = null;
        if (deep) {
          newsBySymbol = await scorePortfolioNews({
            entries: tradeablePositions
              .filter((position) => !fundSymbols.has(position.symbol))
              .map((position) => ({
              symbol: position.symbol,
              news: dataBySymbol[position.symbol]?.news,
            })),
            finbertRun: finbert.run,
            onProgress: ({ phase, articlesTotal }) => {
              setProgress((prev) => ({
                ...prev,
                phase: "news",
                articlesTotal,
                detail:
                  phase === "crawl"
                    ? `Reading ${articlesTotal} article${articlesTotal === 1 ? "" : "s"} across portfolio…`
                    : `Scoring ${articlesTotal} article${articlesTotal === 1 ? "" : "s"} with FinBERT…`,
              }));
            },
          });
        }

        for (let i = 0; i < tradeablePositions.length; i += 1) {
          const position = tradeablePositions[i];
          const { symbol } = position;

          if (fundSymbols.has(symbol)) {
            out.push({
              symbol,
              position,
              report: null,
              isFund: true,
              news: [],
              newsMood: null,
              error: null,
            });
            continue;
          }

          const data = {
            ...dataBySymbol[symbol],
            ...(newsBySymbol ? { news: newsBySymbol[symbol] } : {}),
          };

          setProgress({
            done: i,
            total: tradeablePositions.length,
            symbol,
            phase: "committee",
            detail: null,
          });

          const report = runAnalystCommittee({ symbol, ...data });
          const sentimentAgent = report?.agents?.find(
            (a) => a.key === "sentiment",
          );

          // Previous snapshot (for "changed since last review") must be read
          // from history before today's snapshot overwrites the day slot.
          const previousSnapshot = getPreviousSnapshot(data.history);
          if (report) {
            saveCommitteeSnapshot(symbol, report, COMMITTEE_ENGINE_VERSION);
          }

          out.push({
            symbol,
            position,
            report,
            previousSnapshot,
            news: (data.news || []).slice(0, 3),
            newsMood: sentimentAgent?.summary ?? null,
            error: report ? null : "Not enough cached data",
          });
        }

        setProgress({
          done: tradeablePositions.length,
          total: tradeablePositions.length,
          symbol: null,
          phase: "committee",
          detail: null,
        });

        // Portfolio-level health: allocation, overlap, and how much value
        // sits in Sell-rated names. Funds count toward allocation even
        // though the committee doesn't rate them.
        const healthReport = analyzePortfolioHealth(
          out.map((item) => {
            const chartData = dataBySymbol[item.symbol]?.chartData ?? [];
            const metrics = computePositionMetrics(item.position, chartData);
            return {
              symbol: item.symbol,
              isFund: Boolean(item.isFund),
              currentValue: metrics?.currentValue ?? null,
              closes: chartData
                .map((c) => Number(c.close))
                .filter(Number.isFinite),
              tier: item.report?.verdict?.tier ?? null,
              action: item.report?.verdict?.action ?? null,
              composite: item.report?.verdict?.composite ?? null,
            };
          }),
        );

        writeSession(key, out, mode, healthReport);
        setResults(out);
        setHealth(healthReport);
        setStatus("done");
      } catch {
        setStatus("error");
      }
    },
    [tradeablePositions],
  );

  const reset = useCallback(() => {
    clearSession();
    setStatus("idle");
    setResults([]);
    setReviewMode(null);
    setHealth(null);
    setProgress({
      done: 0,
      total: 0,
      symbol: null,
      phase: "committee",
      detail: null,
    });
  }, []);

  return {
    status,
    results,
    progress,
    reviewMode,
    health,
    run,
    reset,
    count: tradeablePositions.length,
  };
}
