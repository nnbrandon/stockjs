#!/usr/bin/env bash
#
# One-time AWS setup for the daily AI Committee email report. Idempotent —
# safe to re-run; it creates what's missing and updates what exists.
#
# What it does:
#   1. SES: verify the report email identity (user must click the link!)
#   2. S3: private bucket for the committee state JSON
#   3. IAM: ses:SendEmail + s3 Get/Put on the state object for the Lambda role
#   4. Lambda config: timeout 300s, memory 2048MB, handler dist/index.handler,
#      REPORT_* env vars
#   5. EventBridge Scheduler: daily cron at 9:00 AM America/Los_Angeles
#   6. AWS Budget: $1/month with an email alert at 50%
#
# Usage:
#   REPORT_SYMBOLS="AAPL:100:150.25,MSFT:50:300,VTI:20:220" \
#     ./server/scripts/setup-daily-report.sh
#
# Optional overrides:
#   FUNCTION_NAME (default stockjs-api), REGION (default us-east-1),
#   ROLE_NAME (default stockjs-lambda-role),
#   REPORT_EMAIL (default herosekai@gmail.com),
#   SCHEDULE_EXPRESSION (default "cron(0 9 * * ? *)")

set -euo pipefail

FUNCTION_NAME="${FUNCTION_NAME:-stockjs-api}"
REGION="${REGION:-us-east-1}"
ROLE_NAME="${ROLE_NAME:-stockjs-lambda-role}"
REPORT_EMAIL="${REPORT_EMAIL:-herosekai@gmail.com}"
REPORT_SYMBOLS="${REPORT_SYMBOLS:-}"
SCHEDULE_NAME="${SCHEDULE_NAME:-stockjs-daily-report}"
SCHEDULE_EXPRESSION="${SCHEDULE_EXPRESSION:-cron(0 9 * * ? *)}"
SCHEDULER_ROLE_NAME="${SCHEDULER_ROLE_NAME:-stockjs-scheduler-role}"
HANDLER="dist/index.handler"
MEMORY=2048
TIMEOUT=300

if [[ -z "$REPORT_SYMBOLS" ]]; then
  echo "ERROR: set REPORT_SYMBOLS, e.g.:"
  echo '  REPORT_SYMBOLS="AAPL:100:150.25,MSFT:50:300,VTI:20:220" '"$0"
  echo '(format: SYMBOL[:quantity:avgCostBasis], quantity/cost optional —'
  echo ' they enable the portfolio-health value weights)'
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="stockjs-report-state-${ACCOUNT_ID}"
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"
SES_IDENTITY_ARN="arn:aws:ses:${REGION}:${ACCOUNT_ID}:identity/${REPORT_EMAIL}"

echo "==> Account: $ACCOUNT_ID | Region: $REGION | Function: $FUNCTION_NAME"
echo "==> Report email: $REPORT_EMAIL | State bucket: $BUCKET"

# ── 1. SES identity ───────────────────────────────────────────────────────
VERIFY_STATUS="$(aws ses get-identity-verification-attributes \
  --identities "$REPORT_EMAIL" --region "$REGION" \
  --query "VerificationAttributes.\"$REPORT_EMAIL\".VerificationStatus" \
  --output text 2>/dev/null || echo "None")"

if [[ "$VERIFY_STATUS" == "Success" ]]; then
  echo "==> SES: $REPORT_EMAIL already verified"
else
  echo "==> SES: sending verification email to $REPORT_EMAIL"
  aws ses verify-email-identity --email-address "$REPORT_EMAIL" --region "$REGION"
  echo ""
  echo "  ┌──────────────────────────────────────────────────────────────┐"
  echo "  │  ACTION REQUIRED: open $REPORT_EMAIL's inbox and click the   │"
  echo "  │  'Amazon SES verification' link. NOTHING SENDS UNTIL THEN.   │"
  echo "  │  (SES sandbox is fine: verified→verified sending is allowed) │"
  echo "  └──────────────────────────────────────────────────────────────┘"
  echo ""
fi

# ── 2. S3 state bucket (private) ─────────────────────────────────────────
if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null; then
  echo "==> S3: bucket $BUCKET already exists"
else
  echo "==> S3: creating bucket $BUCKET"
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  fi
fi
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# ── 3. IAM: SES + S3 permissions for the Lambda role ─────────────────────
echo "==> IAM: attaching daily-report policy to $ROLE_NAME"
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name stockjs-daily-report \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Effect\": \"Allow\",
        \"Action\": \"ses:SendEmail\",
        \"Resource\": \"$SES_IDENTITY_ARN\"
      },
      {
        \"Effect\": \"Allow\",
        \"Action\": [\"s3:GetObject\", \"s3:PutObject\"],
        \"Resource\": \"arn:aws:s3:::${BUCKET}/committee-state.json\"
      }
    ]
  }"

# ── 4. Lambda config: sizing + env vars + bundled handler ────────────────
# FinBERT needs the memory; the crawl + model cold-start needs the timeout.
echo "==> Lambda: timeout ${TIMEOUT}s, memory ${MEMORY}MB, handler $HANDLER"

# update-function-configuration REPLACES the whole env map — merge with
# whatever is already set so unrelated vars survive.
EXISTING_ENV="$(aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" --region "$REGION" \
  --query 'Environment.Variables' --output json 2>/dev/null || echo 'null')"

MERGED_ENV="$(python3 - "$EXISTING_ENV" "$REPORT_SYMBOLS" "$REPORT_EMAIL" "$BUCKET" <<'PY'
import json, sys
existing = json.loads(sys.argv[1]) or {}
existing.update({
    "REPORT_SYMBOLS": sys.argv[2],
    "REPORT_EMAIL": sys.argv[3],
    "REPORT_STATE_BUCKET": sys.argv[4],
})
print(json.dumps({"Variables": existing}))
PY
)"

aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
aws lambda update-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --handler "$HANDLER" \
  --timeout "$TIMEOUT" \
  --memory-size "$MEMORY" \
  --environment "$MERGED_ENV" >/dev/null
aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"

# ── 5. EventBridge Scheduler → direct Lambda invoke ──────────────────────
if aws iam get-role --role-name "$SCHEDULER_ROLE_NAME" >/dev/null 2>&1; then
  echo "==> IAM: scheduler role $SCHEDULER_ROLE_NAME already exists"
else
  echo "==> IAM: creating scheduler role $SCHEDULER_ROLE_NAME"
  aws iam create-role \
    --role-name "$SCHEDULER_ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": { "Service": "scheduler.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }]
    }' >/dev/null
  sleep 10
fi
aws iam put-role-policy \
  --role-name "$SCHEDULER_ROLE_NAME" \
  --policy-name invoke-stockjs-api \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": \"lambda:InvokeFunction\",
      \"Resource\": \"$LAMBDA_ARN\"
    }]
  }"

SCHEDULER_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${SCHEDULER_ROLE_NAME}"
TARGET="{\"Arn\":\"$LAMBDA_ARN\",\"RoleArn\":\"$SCHEDULER_ROLE_ARN\",\"Input\":\"{\\\"action\\\":\\\"dailyReport\\\"}\"}"

if aws scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "==> Scheduler: updating $SCHEDULE_NAME"
  aws scheduler update-schedule \
    --name "$SCHEDULE_NAME" \
    --region "$REGION" \
    --schedule-expression "$SCHEDULE_EXPRESSION" \
    --schedule-expression-timezone "America/Los_Angeles" \
    --flexible-time-window Mode=OFF \
    --target "$TARGET" >/dev/null
else
  echo "==> Scheduler: creating $SCHEDULE_NAME ($SCHEDULE_EXPRESSION America/Los_Angeles)"
  aws scheduler create-schedule \
    --name "$SCHEDULE_NAME" \
    --region "$REGION" \
    --schedule-expression "$SCHEDULE_EXPRESSION" \
    --schedule-expression-timezone "America/Los_Angeles" \
    --flexible-time-window Mode=OFF \
    --target "$TARGET" >/dev/null
fi

# ── 6. Cost guardrail: $1/month budget, alert at 50% ─────────────────────
if aws budgets describe-budget --account-id "$ACCOUNT_ID" \
  --budget-name stockjs-monthly >/dev/null 2>&1; then
  echo "==> Budget: stockjs-monthly already exists"
else
  echo "==> Budget: creating \$1/month guardrail (alert at 50¢)"
  aws budgets create-budget --account-id "$ACCOUNT_ID" \
    --budget '{"BudgetName":"stockjs-monthly","BudgetLimit":{"Amount":"1","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
    --notifications-with-subscribers "[{\"Notification\":{\"NotificationType\":\"ACTUAL\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":50},\"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"$REPORT_EMAIL\"}]}]" \
    || echo "    (budget creation failed — non-fatal, everything else is set up)"
fi

echo ""
echo "============================================================"
echo " Done!"
echo ""
echo " Remaining manual steps:"
if [[ "$VERIFY_STATUS" != "Success" ]]; then
  echo "  1. Click the SES verification link sent to $REPORT_EMAIL"
  echo "     (no email will ever send until you do)"
fi
echo "  • Deploy the bundled code if you haven't since this change:"
echo "      push to main (deploy-server.yml) or run bootstrap-lambda.sh"
echo "  • Test end-to-end:"
echo "      aws lambda invoke --function-name $FUNCTION_NAME \\"
echo "        --cli-binary-format raw-in-base64-out \\"
echo "        --payload '{\"action\":\"dailyReport\"}' --region $REGION /dev/stdout"
echo "    (set REPORT_ALWAYS_SEND=1 env var temporarily to force a send)"
echo "============================================================"
