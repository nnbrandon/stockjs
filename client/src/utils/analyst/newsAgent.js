// Client-side orchestration that mimics how an LLM agent would gather news
// sentiment via tool calls: retrieve URLs → call a "fetch article text" tool
// (our Lambda) with bounded concurrency → extract → persist → hand back to the
// scorer. It streams a step log so the UI can render the tool-call activity.

import { saveNewsBodies } from "../../db";
import { titleKey } from "./sentiment";

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_CAP = 8;

/**
 * @param {object} opts
 * @param {Array}  opts.news               cached articles ({ id, title, link, body? })
 * @param {(url:string)=>Promise<object>} opts.fetchArticleText  tool fn
 * @param {(steps:Array)=>void} [opts.onStep]   streaming callback
 * @returns {Promise<{ steps, stats }>}
 */
export async function runNewsAgentPipeline({
  news = [],
  fetchArticleText,
  onStep,
  concurrency = DEFAULT_CONCURRENCY,
  cap = DEFAULT_CAP,
} = {}) {
  // Ordered, upsert-able step log so each tool appears once and updates in place.
  const order = [];
  const byId = new Map();
  const emit = (id, patch) => {
    if (!byId.has(id)) {
      order.push(id);
      byId.set(id, { id });
    }
    Object.assign(byId.get(id), patch);
    onStep?.(order.map((k) => ({ ...byId.get(k) })));
  };
  const snapshot = () => order.map((k) => ({ ...byId.get(k) }));

  // Diagnostics so the caller can explain a "nothing to crawl" outcome.
  const alreadyHadBody = news.filter((n) => n.body).length;
  const noLink = news.filter((n) => !n.link && !n.body).length;

  // 1) Retrieve & select: only articles with a link and no body yet, de-duped.
  const candidates = news.filter((n) => n.link && !n.body);
  const seen = new Set();
  const unique = [];
  for (const n of candidates) {
    const key = titleKey(n.title);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(n);
  }
  const targets = unique.slice(0, cap);
  const skippedDupes = candidates.length - unique.length;

  emit("retrieve", {
    tool: "retrieve_news",
    label: "Retrieve & de-duplicate",
    status: "done",
    detail: targets.length
      ? `Selected ${targets.length} article${targets.length > 1 ? "s" : ""} to read${skippedDupes ? ` · skipped ${skippedDupes} reprint${skippedDupes > 1 ? "s" : ""}` : ""}`
      : "Nothing new to read",
  });

  if (!targets.length) {
    emit("retrieve", {
      tool: "retrieve_news",
      label: "Retrieve & de-duplicate",
      status: "done",
      detail: "Articles already have full text (or lack links).",
    });
    return {
      steps: snapshot(),
      stats: {
        requested: 0,
        fetched: 0,
        failed: 0,
        skippedDupes,
        alreadyHadBody,
        noLink,
      },
      bodies: {},
    };
  }

  // 2) Tool calls: fetch article bodies with bounded concurrency.
  emit("fetch", {
    tool: "fetch_article_text",
    label: "Tool: fetch_article_text",
    status: "running",
    detail: `Fetching ${targets.length} article bodies…`,
    progress: { done: 0, total: targets.length },
  });

  const results = [];
  let done = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const item = targets[cursor++];
      const res = await fetchArticleText(item.link);
      done += 1;
      emit("fetch", {
        detail: `Fetched ${done}/${targets.length}`,
        progress: { done, total: targets.length },
      });
      results.push({ item, res });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, worker),
  );

  const ok = results.filter((r) => r.res?.ok && r.res.text);
  const failed = targets.length - ok.length;
  emit("fetch", {
    status: "done",
    detail: `Extracted ${ok.length}/${targets.length}${failed ? ` · ${failed} blocked/paywalled` : ""}`,
    progress: { done: targets.length, total: targets.length },
  });

  // 3) Persist extracted text to the local cache.
  if (ok.length) {
    const updates = ok.map((r) => ({
      id: r.item.id,
      body: r.res.text,
      excerpt: r.res.excerpt,
      fetchedAt: r.res.fetchedAt,
    }));
    await saveNewsBodies(updates);
    emit("persist", {
      tool: "persist_to_cache",
      label: "Persist to local cache",
      status: "done",
      detail: `Stored ${ok.length} article bod${ok.length > 1 ? "ies" : "y"}`,
    });
  }

  // Map freshly-extracted bodies by article id so the caller can score them
  // immediately, without waiting for the DB refresh to propagate.
  const bodies = {};
  for (const r of ok) bodies[r.item.id] = r.res.text;

  return {
    steps: snapshot(),
    stats: {
      requested: targets.length,
      fetched: ok.length,
      failed,
      skippedDupes,
      alreadyHadBody,
      noLink,
    },
    bodies,
  };
}
