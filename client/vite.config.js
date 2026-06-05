import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/stockjs/",
  // transformers.js (+ onnxruntime-web) ships its own ESM/WASM; let it run as a
  // real ES module worker and keep Vite from trying to pre-bundle it.
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
});
