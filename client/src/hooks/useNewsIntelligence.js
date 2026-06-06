import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scoreSymbolNews } from "../utils/scoreSymbolNews";
import {
  hasFinbertScore,
  selectNewsForAnalysis,
} from "../utils/selectNewsForAnalysis";

/**
 * Unified "news intelligence" for the AI Committee: crawl the selected
 * articles' full text, score the un-scored ones with FinBERT (the only
 * sentiment source), and persist those scores to IndexedDB. The committee
 * re-scores live off `finbert.scores` (merged into `news` upstream), so this
 * hook deliberately does NOT emit a global refresh — doing so would re-read the
 * whole symbol from IndexedDB and flash the panel's loading state. Cached
 * scores are reused across reloads and symbol revisits. Auto-runs once per
 * symbol when there's pending work; `run(true)` forces a full re-score.
 *
 * Selection: the 20 most recent articles by default, but if there are more than
 * 20 cached, it widens to every article from the last 30 days (capped at MAX).
 */
export default function useNewsIntelligence({ symbol, news, finbert }) {
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [steps, setSteps] = useState([]);
  const [stats, setStats] = useState(null);
  const autoRunSymbol = useRef(null);

  const total = news?.length || 0;
  const selected = useMemo(() => selectNewsForAnalysis(news), [news]);

  // An article is "scored" if it has a persisted score (from a prior session)
  // or a fresh FinBERT score from this session's worker run. Including the
  // live worker scores lets the UI reflect completed work without re-reading
  // from IndexedDB (which is what caused the loading-state flicker).
  const liveScores = finbert.scores;
  const isScored = useCallback(
    (n) => hasFinbertScore(n) || Boolean(n && liveScores?.[n.id]),
    [liveScores],
  );

  const count = selected.length;
  const pending = useMemo(
    () => selected.filter((n) => !isScored(n)).length,
    [selected, isScored],
  );

  const run = useCallback(
    async (force = false) => {
      if (!symbol || count === 0 || status === "running") return;

      // Only work on articles that don't already have a FinBERT score
      // (unless the caller forces a full re-analyze).
      const targets = force ? selected : selected.filter((n) => !isScored(n));
      if (!targets.length) {
        setSteps([]);
        setStats({ requested: 0, fetched: 0, scored: 0, cached: count });
        setStatus("done");
        return;
      }

      setStatus("running");
      setSteps([]);
      setStats(null);

      try {
        const { stats } = await scoreSymbolNews({
          news,
          finbertRun: finbert.run,
          force,
        });

        setSteps([
          {
            id: "finbert",
            tool: "score_finbert",
            label: "Tool: FinBERT sentiment",
            status: "done",
            detail: `Scored ${stats.scored} article${stats.scored === 1 ? "" : "s"} with FinBERT`,
          },
        ]);

        setStats({
          requested: stats.pending,
          fetched: stats.scored,
          scored: stats.scored,
          cached: stats.cached,
        });
        setStatus("done");
      } catch {
        setStatus("error");
      }
    },
    [symbol, selected, count, status, finbert, isScored],
  );

  // Reset when the symbol changes.
  useEffect(() => {
    setStatus("idle");
    setSteps([]);
    setStats(null);
  }, [symbol]);

  // Auto-run once per symbol — but only if there's un-scored work to do. This
  // only runs while mounted, i.e. when the user is on the AI Committee tab.
  useEffect(() => {
    if (!symbol || count === 0 || pending === 0) return;
    if (autoRunSymbol.current === symbol) return;
    autoRunSymbol.current = symbol;
    run();
  }, [symbol, count, pending, run]);

  return { run, status, steps, stats, count, total, pending };
}
