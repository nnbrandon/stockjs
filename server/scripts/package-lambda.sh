#!/usr/bin/env bash
#
# Build the Lambda deployment zip. Used by both the GitHub Actions deploy
# workflow and bootstrap-lambda.sh so there is exactly one packaging recipe.
#
# The esbuild bundle (dist/index.mjs) inlines every pure-JS dependency, so the
# zip's node_modules only needs @huggingface/transformers (native onnxruntime
# binaries can't be bundled). A full `npm ci` node_modules is ~400MB+, which
# blows Lambda's ~70MB direct-upload request limit — so we stage a minimal
# install and prune it to the linux/x64 pieces Lambda actually loads:
#   • onnxruntime-web: never loaded by the Node build (already inlined in
#     transformers.node.mjs) — deleted.
#   • onnxruntime-node/bin: darwin/win32/arm64 binaries deleted.
#
# Usage: ./server/scripts/package-lambda.sh [/path/to/function.zip]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
OUT_ZIP="${1:-$(dirname "$SERVER_DIR")/function.zip}"

echo "==> Bundling handler (inlines the shared committee engine)"
( cd "$SERVER_DIR" && npm run bundle )

STAGE="$(mktemp -d)/pkg"
mkdir -p "$STAGE"
cp -R "$SERVER_DIR/dist" "$STAGE/dist"

# Runtime package.json: only the un-bundleable dependency, version taken from
# server/package.json so there's no second place to update.
node -e "
const fs = require('fs');
const p = require('$SERVER_DIR/package.json');
fs.writeFileSync(process.argv[1] + '/package.json', JSON.stringify({
  name: 'stockjs-api-runtime',
  private: true,
  type: 'module',
  dependencies: {
    '@huggingface/transformers': p.dependencies['@huggingface/transformers'],
  },
}, null, 2));
" "$STAGE"

# --os/--cpu/--libc make platform-split optional deps (sharp) resolve for the
# Lambda runtime even when packaging from a Mac.
echo "==> Installing runtime dependencies (linux/x64)"
( cd "$STAGE" && npm install --omit=dev --no-audit --no-fund \
    --os=linux --cpu=x64 --libc=glibc >/dev/null )

echo "==> Pruning non-Lambda binaries"
rm -rf "$STAGE/node_modules/onnxruntime-web"
ORT_BIN="$STAGE/node_modules/onnxruntime-node/bin"
# Layout: bin/napi-v*/<platform>/<arch>/ — keep only linux/x64.
find "$ORT_BIN" -mindepth 2 -maxdepth 2 -type d ! -name linux -exec rm -rf {} +
find "$ORT_BIN" -mindepth 3 -maxdepth 3 -type d ! -name x64 -exec rm -rf {} +
if ! find "$ORT_BIN" -type f -path "*/linux/x64/*" | grep -q .; then
  echo "ERROR: pruning removed the linux/x64 onnxruntime binary — the"
  echo "onnxruntime-node bin layout must have changed. Fix package-lambda.sh."
  exit 1
fi

rm -f "$OUT_ZIP"
( cd "$STAGE" && zip -qr "$OUT_ZIP" dist package.json node_modules )

ZIP_BYTES=$(wc -c < "$OUT_ZIP" | tr -d ' ')
echo "==> Packaged $OUT_ZIP ($(du -h "$OUT_ZIP" | cut -f1))"
# Direct UpdateFunctionCode requests cap at ~70MB; leave headroom.
if [ "$ZIP_BYTES" -gt 62914560 ]; then
  echo "ERROR: zip is >60MB — too close to Lambda's direct-upload limit."
  echo "Switch the deploy to S3-based upload (aws lambda update-function-code --s3-bucket ...)."
  exit 1
fi
