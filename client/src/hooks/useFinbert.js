import { useCallback, useEffect, useRef, useState } from "react";

// Drives the FinBERT Web Worker. Lazily spins up the worker on first run,
// streams model-download + scoring progress, and accumulates per-article
// scores keyed by article id. The model download (~tens of MB, quantized) is
// cached by the browser after the first run.
export default function useFinbert() {
  const workerRef = useRef(null);
  const resolveRef = useRef(null);

  // idle | loading (downloading model) | scoring | done | error
  const [status, setStatus] = useState("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const [scoreProgress, setScoreProgress] = useState({ done: 0, total: 0 });
  const [scores, setScores] = useState({}); // id -> { sentiment, confidence, label }
  const [error, setError] = useState(null);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(
      new URL("../workers/finbert.worker.js", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (event) => {
      const msg = event.data || {};
      switch (msg.type) {
        case "model":
          setStatus("loading");
          if (typeof msg.progress === "number") setModelProgress(msg.progress);
          break;
        case "ready":
          setStatus("scoring");
          break;
        case "progress":
          setStatus("scoring");
          setScoreProgress({ done: msg.done, total: msg.total });
          break;
        case "result": {
          const map = {};
          for (const s of msg.scores) map[s.id] = s;
          setScores((prev) => ({ ...prev, ...map }));
          setStatus("done");
          resolveRef.current?.(map);
          resolveRef.current = null;
          break;
        }
        case "error":
          setError(msg.message);
          setStatus("error");
          resolveRef.current?.(null);
          resolveRef.current = null;
          break;
        default:
          break;
      }
    };

    worker.onerror = (e) => {
      setError(e.message || "Worker failed to load");
      setStatus("error");
      resolveRef.current?.(null);
      resolveRef.current = null;
    };

    workerRef.current = worker;
    return worker;
  }, []);

  const run = useCallback(
    (items) => {
      const payload = (items || []).filter(
        (it) => it && it.id != null && it.text,
      );
      if (!payload.length) return Promise.resolve({});

      const worker = ensureWorker();
      setError(null);
      setStatus("loading");
      setScoreProgress({ done: 0, total: payload.length });

      return new Promise((resolve) => {
        resolveRef.current = resolve;
        worker.postMessage({ type: "score", items: payload });
      });
    },
    [ensureWorker],
  );

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  return { run, status, modelProgress, scoreProgress, scores, error };
}
