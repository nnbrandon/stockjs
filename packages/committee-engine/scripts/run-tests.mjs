// Test runner for the committee engine. The engine's source uses extensionless
// and package-alias imports that plain `node` can't resolve, so we bundle each
// test/*.test.js with esbuild first, then hand the bundles to `node --test`.
//
// Usage: `npm test` (from packages/committee-engine).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const testDir = join(pkgRoot, "test");
const engineSrc = join(pkgRoot, "src");

const testFiles = readdirSync(testDir)
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => join(testDir, f));

if (!testFiles.length) {
  console.error("No test files found in", testDir);
  process.exit(1);
}

const outDir = mkdtempSync(join(tmpdir(), "committee-tests-"));

try {
  // Bundle every test into the temp dir as .mjs. The alias lets walkForward's
  // "@stockjs/committee-engine/..." imports resolve to the engine source.
  execFileSync(
    "npx",
    [
      "--yes",
      "esbuild@0.24",
      ...testFiles,
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node20",
      `--outdir=${outDir}`,
      "--out-extension:.js=.mjs",
      `--alias:@stockjs/committee-engine=${engineSrc}`,
    ],
    { stdio: "inherit" },
  );

  const bundled = readdirSync(outDir)
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => join(outDir, f));

  // `node --test <files>` treats the given files as test files regardless of
  // their names, and exits non-zero if any test fails.
  execFileSync("node", ["--test", ...bundled], { stdio: "inherit" });
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
