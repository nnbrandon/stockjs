const BASE_CAP = 20;
const WINDOW_DAYS = 30;
const MAX = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export function hasFinbertScore(article) {
  return Boolean(
    article?.model && Number.isFinite(article.model.sentiment),
  );
}

/** Same article window as the per-symbol AI Committee news agent. */
export function selectNewsForAnalysis(news = []) {
  const list = news || [];
  if (list.length <= BASE_CAP) return list.slice(0, BASE_CAP);

  const cutoff = Date.now() - WINDOW_DAYS * DAY_MS;
  const window = list.filter((n) => {
    const t = new Date(n.date).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });

  if (window.length <= MAX) {
    return window.length >= BASE_CAP ? window : list.slice(0, BASE_CAP);
  }

  const step = (window.length - 1) / (MAX - 1);
  const picks = [];
  for (let i = 0; i < MAX; i += 1) {
    picks.push(window[Math.round(i * step)]);
  }
  return picks;
}
