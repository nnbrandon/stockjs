import { useCallback, useEffect, useMemo, useState } from "react";

import LambdaService from "../LambdaService";
import { isTradeableTickerSymbol } from "../utils/parseFidelityCsv";
import {
  getReportSyncEmail,
  getReportSyncToken,
  isReportSyncConfigured,
} from "../utils/reportPortfolioSync";

// Server-backed committee (single source of truth): the Lambda pipeline is
// the only thing that fetches, FinBERT-scores, and judges. This hook READS
// the last stored run on mount (fast) and `run()` asks the server to analyze
// now — the same stored state also feeds the daily email, so the UI and the
// email can never disagree.

/** Session-only cache — survives in-app navigation, cleared on page refresh. */
let sessionCache = null;

function buildPositionKey(positions) {
  return positions
    .map((p) => p.symbol)
    .sort()
    .join("|");
}

/** Server row + local position → the item shape the panels render. */
function toItem(row, position) {
  const latest = row?.latest ?? null;
  return {
    symbol: position.symbol,
    position,
    report: latest?.report ?? null,
    previousSnapshot: latest?.previousSnapshot ?? null,
    isFund: Boolean(latest?.isFund),
    news: (row?.articles ?? []).slice(0, 3),
    newsMood: latest?.newsMood ?? null,
    generatedAt: latest?.generatedAt ?? null,
    error: latest
      ? (latest.error ??
        (latest.report || latest.isFund ? null : "Not enough data yet"))
      : "Not analyzed yet — run the committee",
  };
}

function mapServerResponse(data, tradeablePositions) {
  const rowsBySymbol = new Map(
    (data.results ?? []).map((r) => [r.symbol, r]),
  );
  const results = tradeablePositions.map((position) =>
    toItem(rowsBySymbol.get(position.symbol), position),
  );
  const anyAnalyzed = results.some((r) => r.report || r.isFund);
  return { results, health: data.health ?? null, anyAnalyzed };
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

  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState([]);
  const [health, setHealth] = useState(null);
  const [progress, setProgress] = useState({
    done: 0,
    total: 0,
    symbol: null,
    phase: "server",
    detail: null,
  });

  const configured = isReportSyncConfigured();

  // On mount / portfolio change: show the last stored server run (pure read).
  useEffect(() => {
    if (!tradeablePositions.length) return undefined;

    if (sessionCache?.positionKey === positionKey) {
      setStatus("done");
      setResults(sessionCache.results);
      setHealth(sessionCache.health);
      return undefined;
    }

    if (!configured) {
      setStatus("idle");
      setResults([]);
      setHealth(null);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setStatus("running");
      setProgress({
        done: 0,
        total: tradeablePositions.length,
        symbol: null,
        phase: "server",
        detail: "Loading the committee's latest results…",
      });
      const data = await LambdaService.fetchCommitteeResults(
        getReportSyncToken(),
        getReportSyncEmail(),
      );
      if (cancelled) return;
      if (!data.ok) {
        // No stored run / no synced portfolio yet — offer a fresh run.
        setStatus("idle");
        return;
      }
      const mapped = mapServerResponse(data, tradeablePositions);
      if (!mapped.anyAnalyzed) {
        setStatus("idle");
        return;
      }
      sessionCache = { positionKey, ...mapped };
      setResults(mapped.results);
      setHealth(mapped.health);
      setStatus("done");
    })();
    return () => {
      cancelled = true;
    };
  }, [positionKey, tradeablePositions, configured]);

  // Ask the server to analyze NOW. The result is persisted server-side, so
  // the next daily email is built from this exact run.
  const run = useCallback(async () => {
    if (!tradeablePositions.length || !configured) return;

    setStatus("running");
    setResults([]);
    setProgress({
      done: 0,
      total: tradeablePositions.length,
      symbol: null,
      phase: "server",
      detail: `Analyzing ${tradeablePositions.length} holding${tradeablePositions.length === 1 ? "" : "s"} on the server — first run can take a minute…`,
    });

    const data = await LambdaService.runCommitteeServer(
      getReportSyncToken(),
      getReportSyncEmail(),
    );
    if (!data.ok) {
      setStatus("error");
      return;
    }
    const mapped = mapServerResponse(data, tradeablePositions);
    sessionCache = { positionKey, ...mapped };
    setResults(mapped.results);
    setHealth(mapped.health);
    setStatus("done");
  }, [tradeablePositions, positionKey, configured]);

  const reset = useCallback(() => {
    sessionCache = null;
    setStatus("idle");
    setResults([]);
    setHealth(null);
    setProgress({
      done: 0,
      total: 0,
      symbol: null,
      phase: "server",
      detail: null,
    });
  }, []);

  return {
    status,
    results,
    progress,
    reviewMode: "server",
    health,
    run,
    reset,
    count: tradeablePositions.length,
    configured,
  };
}
