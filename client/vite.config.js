import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The AI Committee engine is a shared package consumed by this client AND the
// Lambda server (bundled at deploy time) — one source of truth, no drift.
const enginePath = fileURLToPath(
  new URL("../packages/committee-engine/src", import.meta.url),
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/stockjs/",
  resolve: {
    alias: { "@stockjs/committee-engine": enginePath },
  },
  // The engine lives outside the Vite root; allow the dev server to serve it.
  server: {
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
  // transformers.js (+ onnxruntime-web) ships its own ESM/WASM; let it run as a
  // real ES module worker and keep Vite from trying to pre-bundle it.
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
});
