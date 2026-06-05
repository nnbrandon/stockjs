import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LambdaService from "../LambdaService";
import { saveNewsSentiment } from "../db";
import { runNewsAgentPipeline } from "../utils/analyst/newsAgent";

const BASE_CAP = 20; // analyze at least the 20 most recent articles
const WINDOW_DAYS = 30; // when there are more than 20, widen to the last 30 days
const MAX = 60; // hard ceiling so a flood of articles can't run away

const DAY_MS = 24 * 60 * 60 * 1000;

// An article is considered already analyzed if it carries a cached FinBERT
// score (persisted on the news row) — so we never re-score it.
const hasScore = (n) => Boolean(n?.model && Number.isFinite(n.model.sentiment));

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

  // Decide which articles to analyze (news is newest-first).
  const selected = useMemo(() => {
    const list = news || [];
    if (list.length <= BASE_CAP) return list.slice(0, BASE_CAP);

    const cutoff = Date.now() - WINDOW_DAYS * DAY_MS;
    const window = list.filter((n) => {
      const t = new Date(n.date).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });

    // If the 30-day window is small, take it all (but never fewer than the
    // 20 most recent). If it fits under MAX, analyze the whole window.
    if (window.length <= MAX) {
      return window.length >= BASE_CAP ? window : list.slice(0, BASE_CAP);
    }

    // The window has more articles than we can afford. Rather than cutting it
    // off at the newest MAX (which would only cover the last few days), spread
    // the picks evenly across the full 30 days so older articles are sampled
    // too. The newest and oldest in-window articles are always included.
    const step = (window.length - 1) / (MAX - 1);
    const picks = [];
    for (let i = 0; i < MAX; i += 1) {
      picks.push(window[Math.round(i * step)]);
    }
    return picks;
  }, [news]);

  // An article is "scored" if it has a persisted score (from a prior session)
  // or a fresh FinBERT score from this session's worker run. Including the
  // live worker scores lets the UI reflect completed work without re-reading
  // from IndexedDB (which is what caused the loading-state flicker).
  const liveScores = finbert.scores;
  const isScored = useCallback(
    (n) => hasScore(n) || Boolean(n && liveScores?.[n.id]),
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
        // 1) Crawl article bodies for these targets (only those missing a body).
        let crawlSteps = [];
        const { stats: crawlStats, bodies } = await runNewsAgentPipeline({
          news: targets,
          cap: targets.length,
          fetchArticleText: (url) => LambdaService.fetchArticleText(url),
          onStep: (s) => {
            crawlSteps = s;
            setSteps([...s]);
          },
        });

        // 2) Score with FinBERT, using the freshest text available.
        const items = targets
          .filter((n) => n && n.id != null)
          .map((n) => {
            const text = (
              bodies?.[n.id] ||
              n.body ||
              n.summary ||
              n.title ||
              ""
            ).trim();
            return { id: n.id, text };
          })
          .filter((it) => it.text);

        const fbStep = {
          id: "finbert",
          tool: "score_finbert",
          label: "Tool: FinBERT sentiment",
          status: "running",
          detail: `Scoring ${items.length} article${items.length === 1 ? "" : "s"} on-device…`,
        };
        setSteps([...crawlSteps, fbStep]);

        const scores = await finbert.run(items);

        // 3) Persist the scores so they're reused next time (no re-run).
        const updates = items
          .map((it) =>
            scores[it.id] ? { id: it.id, model: scores[it.id] } : null,
          )
          .filter(Boolean);
        if (updates.length) {
          await saveNewsSentiment(updates);
        }

        setSteps([
          ...crawlSteps,
          {
            ...fbStep,
            status: "done",
            detail: `Scored ${updates.length} article${updates.length === 1 ? "" : "s"} with FinBERT`,
          },
        ]);

        setStats({
          ...crawlStats,
          scored: updates.length,
          cached: count - targets.length,
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
