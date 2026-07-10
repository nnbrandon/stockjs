import { useCallback, useEffect, useMemo, useState } from "react";

import LambdaService from "../LambdaService";
import { isTradeableTickerSymbol } from "../utils/parseFidelityCsv";
import {
  getCommitteeGeneratedAt,
  getCommitteeHealth,
  getCommitteeRow,
  getCommitteeTrackRecord,
  isCommitteeCacheLoaded,
  resetCommitteeCache,
  storeCommitteeResponse,
  subscribeCommitteeCache,
} from "../utils/committeeServerCache";
import {
  getReportSyncEmail,
  getReportSyncToken,
  isReportSyncConfigured,
} from "../utils/reportPortfolioSync";

// Server-backed committee (single source of truth): the Lambda pipeline is
// the only thing that fetches, FinBERT-scores, and judges. This hook READS
// the last stored run on mount (fast) and `run()` asks the server to analyze
// now — the same stored state also feeds the daily email and the per-ticker
// AnalystPanel (via the shared committeeServerCache), so no surface can
// disagree with another.

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

function mapFromCache(email, tradeablePositions) {
  const results = tradeablePositions.map((position) =>
    toItem(getCommitteeRow(email, position.symbol), position),
  );
  const anyAnalyzed = results.some((r) => r.report || r.isFund);
  return {
    results,
    health: getCommitteeHealth(email),
    trackRecord: getCommitteeTrackRecord(email),
    generatedAt: getCommitteeGeneratedAt(email),
    anyAnalyzed,
  };
}

export default function usePortfolioCommittee(positions) {
  const tradeablePositions = useMemo(
    () => positions.filter((p) => isTradeableTickerSymbol(p.symbol)),
    [positions],
  );

  const positionKey = useMemo(
    () =>
      tradeablePositions
        .map((p) => p.symbol)
        .sort()
        .join("|"),
    [tradeablePositions],
  );

  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState([]);
  const [health, setHealth] = useState(null);
  const [trackRecord, setTrackRecord] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [progress, setProgress] = useState({
    done: 0,
    total: 0,
    symbol: null,
    phase: "server",
    detail: null,
  });

  const configured = isReportSyncConfigured();

  const applyView = useCallback(
    (view) => {
      setResults(view.results);
      setHealth(view.health);
      setTrackRecord(view.trackRecord);
      setGeneratedAt(view.generatedAt);
      setStatus(view.anyAnalyzed ? "done" : "idle");
    },
    [],
  );

  // Cache writes from anywhere (e.g. an AnalystPanel run on a single symbol)
  // must refresh this always-mounted provider too — its own effects only run
  // on mount/portfolio change.
  useEffect(() => {
    return subscribeCommitteeCache(() => {
      if (!configured || !tradeablePositions.length) return;
      const email = getReportSyncEmail();
      if (!isCommitteeCacheLoaded(email)) return;
      setStatus((current) => {
        // Never interrupt an in-flight run's own state handling.
        if (current === "running") return current;
        const view = mapFromCache(email, tradeablePositions);
        setResults(view.results);
        setHealth(view.health);
        setTrackRecord(view.trackRecord);
        setGeneratedAt(view.generatedAt);
        return view.anyAnalyzed ? "done" : "idle";
      });
    });
  }, [configured, tradeablePositions]);

  // On mount / portfolio change: show the last stored server run (pure read).
  useEffect(() => {
    if (!tradeablePositions.length) return undefined;

    if (!configured) {
      setStatus("idle");
      setResults([]);
      setHealth(null);
      setTrackRecord(null);
      setGeneratedAt(null);
      return undefined;
    }

    const email = getReportSyncEmail();
    if (isCommitteeCacheLoaded(email)) {
      applyView(mapFromCache(email, tradeablePositions));
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
        email,
      );
      if (cancelled) return;
      if (!data.ok) {
        // No stored run / no synced portfolio yet — offer a fresh run.
        setStatus("idle");
        return;
      }
      storeCommitteeResponse(email, data);
      applyView(mapFromCache(email, tradeablePositions));
    })();
    return () => {
      cancelled = true;
    };
  }, [positionKey, tradeablePositions, configured, applyView]);

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

    const email = getReportSyncEmail();
    const data = await LambdaService.runCommitteeServer(
      getReportSyncToken(),
      email,
    );
    if (!data.ok) {
      setStatus("error");
      return;
    }
    storeCommitteeResponse(email, data);
    const view = mapFromCache(email, tradeablePositions);
    setResults(view.results);
    setHealth(view.health);
    setTrackRecord(view.trackRecord);
    setGeneratedAt(view.generatedAt);
    setStatus("done");
  }, [tradeablePositions, configured]);

  const reset = useCallback(() => {
    resetCommitteeCache();
    setStatus("idle");
    setResults([]);
    setHealth(null);
    setTrackRecord(null);
    setGeneratedAt(null);
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
    trackRecord,
    generatedAt,
    run,
    reset,
    count: tradeablePositions.length,
    configured,
  };
}
