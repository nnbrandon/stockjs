#!/usr/bin/env bash
#
# One-time setup for the stockjs API Lambda. Run this once locally with the AWS
# CLI configured (`aws configure`). It is idempotent — safe to re-run; it will
# create whatever is missing and skip what already exists.
#
# After it finishes it prints the Function URL. Put that URL into the GitHub
# repository variable VITE_LAMBDA_URL so the client build points at it.
#
# Usage:
#   ./server/scripts/bootstrap-lambda.sh
#
# Override defaults with env vars, e.g.:
#   FUNCTION_NAME=stockjs-api REGION=us-east-1 ./server/scripts/bootstrap-lambda.sh

set -euo pipefail

FUNCTION_NAME="${FUNCTION_NAME:-stockjs-api}"
REGION="${REGION:-us-east-1}"
ROLE_NAME="${ROLE_NAME:-stockjs-lambda-role}"
RUNTIME="${RUNTIME:-nodejs22.x}"
# The deploy artifact is an esbuild bundle at dist/index.mjs (the shared
# committee engine is inlined at build time — see deploy-server.yml).
HANDLER="dist/index.handler"
MEMORY="${MEMORY:-256}"
TIMEOUT="${TIMEOUT:-30}"

# Resolve paths relative to this script so it works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Region: $REGION | Function: $FUNCTION_NAME | Runtime: $RUNTIME"

PROVIDED_ROLE_ARN="${ROLE_ARN:-}" # set when the caller brings their own role

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
# Honor a caller-provided ROLE_ARN; otherwise derive it from the role name.
ROLE_ARN="${ROLE_ARN:-arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}}"

# ── 1. IAM execution role ────────────────────────────────────────────────
# If you don't have IAM permissions to create roles (common when your user has
# a permissions boundary), create the role once in the AWS Console and pass its
# ARN: ROLE_ARN=arn:aws:iam::<acct>:role/stockjs-lambda-role ./bootstrap-lambda.sh
if [[ -n "$PROVIDED_ROLE_ARN" ]]; then
  echo "==> Using provided role: $ROLE_ARN"
elif aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "==> IAM role $ROLE_NAME already exists"
else
  echo "==> Creating IAM role $ROLE_NAME"
  if ! aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": { "Service": "lambda.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }]
    }' >/dev/null; then
    echo ""
    echo "ERROR: Your AWS user can't create IAM roles (iam:CreateRole denied)."
    echo "Create the role once in the AWS Console, then re-run this script with"
    echo "its ARN:"
    echo ""
    echo "  Console → IAM → Roles → Create role"
    echo "    • Trusted entity: AWS service → Lambda"
    echo "    • Permissions: AWSLambdaBasicExecutionRole"
    echo "    • Name: $ROLE_NAME"
    echo ""
    echo "  Then: ROLE_ARN=arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME} \\"
    echo "        $0"
    exit 1
  fi
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "==> Waiting for role to propagate..."
  sleep 12
fi

# ── 2. Build deployment package ──────────────────────────────────────────
echo "==> Installing production dependencies"
( cd "$SERVER_DIR" && npm ci --omit=dev >/dev/null )

echo "==> Bundling handler (inlines the shared committee engine)"
( cd "$SERVER_DIR" && npm run bundle >/dev/null )

echo "==> Zipping function"
ZIP_PATH="$(mktemp -d)/function.zip"
( cd "$SERVER_DIR" && zip -qr "$ZIP_PATH" dist package.json node_modules )

# ── 3. Create or update the function ─────────────────────────────────────
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "==> Function exists — updating code"
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_PATH" \
    --region "$REGION" >/dev/null

  # Functions created before the esbuild-bundle era still point at
  # index.handler; flip them to the bundled entrypoint.
  CURRENT_HANDLER="$(aws lambda get-function-configuration \
    --function-name "$FUNCTION_NAME" --region "$REGION" \
    --query Handler --output text)"
  if [[ "$CURRENT_HANDLER" != "$HANDLER" ]]; then
    echo "==> Updating handler: $CURRENT_HANDLER → $HANDLER"
    aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
    aws lambda update-function-configuration \
      --function-name "$FUNCTION_NAME" \
      --handler "$HANDLER" \
      --region "$REGION" >/dev/null
  fi
else
  echo "==> Creating function $FUNCTION_NAME"
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" \
    --role "$ROLE_ARN" \
    --handler "$HANDLER" \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY" \
    --zip-file "fileb://$ZIP_PATH" \
    --region "$REGION" >/dev/null
  echo "==> Waiting for function to become active..."
  aws lambda wait function-active --function-name "$FUNCTION_NAME" --region "$REGION"
fi

# ── 4. Public Function URL + CORS (app code also sets CORS headers) ──────
CORS_CONFIG='{"AllowMethods":["GET","OPTIONS"],"AllowOrigins":["http://localhost:5173","https://nnbrandon.github.io"],"AllowHeaders":["*"],"MaxAge":86400}'

if aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "==> Updating Function URL CORS"
  aws lambda update-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE \
    --cors "$CORS_CONFIG" \
    --region "$REGION" >/dev/null
else
  echo "==> Creating Function URL (auth: NONE)"
  aws lambda create-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE \
    --cors "$CORS_CONFIG" \
    --region "$REGION" >/dev/null
fi

# Allow public invoke of the Function URL (idempotent — ignore if already set).
aws lambda add-permission \
  --function-name "$FUNCTION_NAME" \
  --statement-id FunctionURLAllowPublicAccess \
  --action lambda:InvokeFunctionUrl \
  --principal "*" \
  --function-url-auth-type NONE \
  --region "$REGION" >/dev/null 2>&1 || true

FUNCTION_URL="$(aws lambda get-function-url-config \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query FunctionUrl --output text)"

echo ""
echo "============================================================"
echo " Done! Function URL:"
echo "   $FUNCTION_URL"
echo ""
echo " Next steps:"
echo "  1. Set GitHub repo VARIABLE  VITE_LAMBDA_URL = $FUNCTION_URL"
echo "  2. Set GitHub repo VARIABLE  AWS_REGION = $REGION"
echo "  3. Set GitHub repo VARIABLE  LAMBDA_FUNCTION_NAME = $FUNCTION_NAME"
echo "  4. Set GitHub repo SECRETS   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY"
echo "============================================================"
