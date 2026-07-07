// Local dry run of the daily report against the esbuild bundle (the same
// artifact Lambda runs). No AWS credentials needed: REPORT_DRY_RUN logs the
// email instead of sending, and with no REPORT_STATE_BUCKET the run is
// stateless.
//
//   npm run report:dry
//   REPORT_SYMBOLS="AAPL:10:150,VTI:5" npm run report:dry

process.env.REPORT_DRY_RUN ??= "1";
process.env.REPORT_SYMBOLS ??= "AAPL:10:150";
// Cache the FinBERT model between local runs.
process.env.HF_CACHE_DIR ??= new URL("../.hf-cache", import.meta.url).pathname;

const { handler } = await import("../dist/index.mjs");
const res = await handler({ action: "dailyReport" });
console.log("\n=== handler result ===");
console.log(res);
