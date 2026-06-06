import { useCallback, useEffect, useMemo, useState } from "react";
import { runAnalystCommittee } from "../utils/analyst";
import { loadCommitteeData } from "../utils/loadCommitteeData";
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

function writeSession(positionKey, results, reviewMode) {
  sessionCache = { positionKey, status: "done", results, reviewMode };
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
    };
  }
  return { status: "idle", results: [], reviewMode: null };
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
    } else {
      setStatus("idle");
      setResults([]);
      setReviewMode(null);
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

        let newsBySymbol = null;
        if (deep) {
          newsBySymbol = await scorePortfolioNews({
            entries: tradeablePositions.map((position) => ({
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

          out.push({
            symbol,
            position,
            report,
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
        writeSession(key, out, mode);
        setResults(out);
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
    run,
    reset,
    count: tradeablePositions.length,
  };
}
