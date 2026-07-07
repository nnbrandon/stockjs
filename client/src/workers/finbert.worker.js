// FinBERT sentiment scoring in a Web Worker, so the (heavy) model load and
// inference never block the UI thread. Runs entirely on-device via
// transformers.js — no API, no recurring cost.
//
// Speed strategy (matters most for "deep review" with 500+ articles):
//   1. WebGPU when available — orders of magnitude faster than WASM for
//      transformer inference; falls back to single-threaded WASM otherwise
//      (single-thread avoids needing COOP/COEP headers, which GitHub Pages
//      doesn't send).
//   2. Batched inference — score many articles per forward pass instead of one
//      at a time, amortizing per-call overhead.
//   3. Length bucketing — sort by text length before batching so each batch
//      pads to a similar length, avoiding wasted compute on short articles
//      stuck in a batch with a long one.

import { pipeline, env } from "@huggingface/transformers";
import {
  FINBERT_MODEL_ID as MODEL_ID,
  NEUTRAL_SCORE,
  prepareFinbertText,
  toSignedScore,
} from "@stockjs/committee-engine/finbertScore.js";

// Always pull weights from the Hugging Face CDN; never look for local files.
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

// Batch sizes tuned per backend: the GPU happily chews through bigger batches,
// while WASM is single-threaded so smaller batches keep memory/latency sane.
const BATCH_SIZE = { webgpu: 32, wasm: 8 };

let classifierPromise = null;
let activeDevice = null;

async function pickDevice() {
  try {
    if (self.navigator?.gpu) {
      const adapter = await self.navigator.gpu.requestAdapter();
      if (adapter) return "webgpu";
    }
  } catch {
    // requestAdapter can throw on some platforms; fall through to WASM.
  }
  return "wasm";
}

function createClassifier(device) {
  return pipeline("text-classification", MODEL_ID, {
    device,
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

async function getClassifier() {
  if (!classifierPromise) {
    activeDevice = await pickDevice();
    classifierPromise = createClassifier(activeDevice);
  }
  return classifierPromise;
}

// Score mapping + text prep live in the shared engine package so the Lambda
// daily report produces byte-compatible scores (see finbertScore.js).
const NEUTRAL = NEUTRAL_SCORE;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

self.onmessage = async (event) => {
  const { type, items } = event.data || {};
  if (type !== "score") return;

  try {
    let classifier = await getClassifier();
    self.postMessage({ type: "ready" });

    // Normalize + remember original order; assign neutral to empty texts up
    // front so they don't need a model pass.
    const prepared = (items || []).map((item) => ({
      id: item.id,
      text: prepareFinbertText(item.text),
    }));

    const scoreById = new Map();
    const toScore = [];
    for (const it of prepared) {
      if (it.text) toScore.push(it);
      else scoreById.set(it.id, { ...NEUTRAL });
    }

    // Length bucketing: similar-length texts batch together → minimal padding.
    toScore.sort((a, b) => a.text.length - b.text.length);

    const total = prepared.length;
    let done = scoreById.size;
    if (done) self.postMessage({ type: "progress", done, total });

    const runBatches = async () => {
      const batchSize = BATCH_SIZE[activeDevice] || BATCH_SIZE.wasm;
      // Only touch items we haven't scored yet, so a mid-run device fallback
      // resumes instead of re-scoring everything.
      const pending = toScore.filter((b) => !scoreById.has(b.id));
      for (const batch of chunk(pending, batchSize)) {
        const preds = await classifier(
          batch.map((b) => b.text),
          { top_k: 3 },
        );
        // With an array input + top_k, the result is an array (per input) of
        // arrays (per label).
        batch.forEach((b, idx) => {
          const p = preds[idx];
          scoreById.set(b.id, toSignedScore(Array.isArray(p) ? p : [p]));
        });
        done += batch.length;
        self.postMessage({ type: "progress", done, total });
      }
    };

    try {
      await runBatches();
    } catch (err) {
      // WebGPU can fail at runtime (driver/op support). Rebuild on WASM once
      // and retry the remaining work rather than failing the whole run.
      if (activeDevice === "webgpu") {
        self.postMessage({
          type: "model",
          status: "fallback",
          file: "webgpu→wasm",
          progress: null,
        });
        activeDevice = "wasm";
        classifierPromise = createClassifier("wasm");
        classifier = await classifierPromise;
        await runBatches();
      } else {
        throw err;
      }
    }

    const scores = prepared.map((it) => ({
      id: it.id,
      ...(scoreById.get(it.id) || NEUTRAL),
    }));
    self.postMessage({ type: "result", scores });
  } catch (err) {
    self.postMessage({ type: "error", message: err?.message || String(err) });
  }
};
