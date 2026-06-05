// FinBERT sentiment scoring in a Web Worker, so the (heavy) model load and
// inference never block the UI thread. Runs entirely on-device via
// transformers.js — no API, no recurring cost. Uses WebGPU when available and
// falls back to single-threaded WASM (single-thread avoids needing
// COOP/COEP headers, which GitHub Pages doesn't send).

import { pipeline, env } from "@huggingface/transformers";

// Always pull weights from the Hugging Face CDN; never look for local files.
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

const MODEL_ID = "Xenova/finbert";
const MAX_CHARS = 1600; // ~roughly within the 512-token limit

let classifierPromise = null;

function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = pipeline("text-classification", MODEL_ID, {
      dtype: "q8", // quantized → smaller download, faster inference
      progress_callback: (p) => {
        // p: { status, file, progress (0..100), loaded, total }
        self.postMessage({
          type: "model",
          status: p.status,
          file: p.file,
          progress: typeof p.progress === "number" ? p.progress / 100 : null,
        });
      },
    });
  }
  return classifierPromise;
}

// Map FinBERT's {positive, negative, neutral} probabilities to a single
// signed score in [-1, 1] plus a confidence (the winning probability).
function toSigned(predictions) {
  let pos = 0;
  let neg = 0;
  let top = { label: "neutral", score: 0 };
  for (const p of predictions) {
    const label = String(p.label).toLowerCase();
    if (label === "positive") pos = p.score;
    else if (label === "negative") neg = p.score;
    if (p.score > top.score) top = { label, score: p.score };
  }
  return {
    sentiment: pos - neg, // -1..+1
    confidence: top.score, // 0..1
    label: top.label,
  };
}

self.onmessage = async (event) => {
  const { type, items } = event.data || {};
  if (type !== "score") return;

  try {
    const classifier = await getClassifier();
    self.postMessage({ type: "ready" });

    const scores = [];
    const total = items.length;
    for (let i = 0; i < total; i++) {
      const item = items[i];
      const text = (item.text || "").slice(0, MAX_CHARS).trim();

      let result = { sentiment: 0, confidence: 0, label: "neutral" };
      if (text) {
        const preds = await classifier(text, { top_k: 3 });
        result = toSigned(Array.isArray(preds) ? preds : [preds]);
      }

      scores.push({ id: item.id, ...result });
      self.postMessage({ type: "progress", done: i + 1, total });
    }

    self.postMessage({ type: "result", scores });
  } catch (err) {
    self.postMessage({ type: "error", message: err?.message || String(err) });
  }
};
