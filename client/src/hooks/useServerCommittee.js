import { useCallback, useEffect, useState } from "react";

import LambdaService from "../LambdaService";
import {
  getCommitteeRow,
  isCommitteeCacheLoaded,
  storeCommitteeResponse,
  subscribeCommitteeCache,
} from "../utils/committeeServerCache";
import {
  getReportSyncEmail,
  getReportSyncToken,
  isReportSyncConfigured,
} from "../utils/reportPortfolioSync";

// One symbol's view of the server-side committee (single source of truth).
// Held symbols come from the last stored run — read through the same shared
// cache the portfolio panel uses, so runs triggered anywhere update both
// surfaces. Any symbol, held or browsed, can be (re)analyzed on demand via
// action=runCommittee.

/**
 * Statuses: "unconfigured" (sync not set up), "loading" (reading stored
 * results), "norun" (no stored verdict for this symbol — offer a run),
 * "running" (server analyzing), "done", "error".
 */
export default function useServerCommittee(symbol) {
  const configured = isReportSyncConfigured();
  const [status, setStatus] = useState(configured ? "loading" : "unconfigured");
  const [row, setRow] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!symbol) return undefined;
    if (!configured) {
      setStatus("unconfigured");
      setRow(null);
      return undefined;
    }

    const email = getReportSyncEmail();
    if (isCommitteeCacheLoaded(email)) {
      const cached = getCommitteeRow(email, symbol);
      setRow(cached);
      setStatus(cached?.latest ? "done" : "norun");
      return undefined;
    }

    let active = true;
    (async () => {
      setStatus("loading");
      const data = await LambdaService.fetchCommitteeResults(
        getReportSyncToken(),
        email,
      );
      if (!active) return;
      if (data.ok) storeCommitteeResponse(email, data);
      const found = data.ok ? getCommitteeRow(email, symbol) : null;
      setRow(found);
      setStatus(found?.latest ? "done" : "norun");
    })();
    return () => {
      active = false;
    };
  }, [symbol, configured]);

  // Refresh from cache writes made elsewhere (portfolio-panel runs) so an
  // open ticker view doesn't keep rendering a superseded verdict.
  useEffect(() => {
    if (!symbol || !configured) return undefined;
    return subscribeCommitteeCache(() => {
      const email = getReportSyncEmail();
      if (!isCommitteeCacheLoaded(email)) return;
      setStatus((current) => {
        if (current === "running" || current === "loading") return current;
        const cached = getCommitteeRow(email, symbol);
        setRow(cached);
        return cached?.latest ? "done" : "norun";
      });
    });
  }, [symbol, configured]);

  const run = useCallback(async () => {
    if (!symbol || !configured) return;
    setStatus("running");
    setError("");
    const email = getReportSyncEmail();
    const data = await LambdaService.runCommitteeServer(
      getReportSyncToken(),
      email,
      [symbol],
    );
    if (!data.ok) {
      setError(data.error || "Committee run failed");
      setStatus("error");
      return;
    }
    storeCommitteeResponse(email, data);
    const found = getCommitteeRow(email, symbol);
    setRow(found);
    setStatus(found?.latest ? "done" : "error");
  }, [symbol, configured]);

  return { status, row, error, run, configured };
}
