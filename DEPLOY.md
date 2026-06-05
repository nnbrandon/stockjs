# Deployment

Two pieces deploy independently, both **automatically on push to `main`**:

| Part           | Hosted on            | Workflow                              |
| -------------- | -------------------- | ------------------------------------- |
| Client (Vite)  | GitHub Pages         | `.github/workflows/deploy-client.yml` |
| Server (Lambda)| AWS Lambda + URL     | `.github/workflows/deploy-server.yml` |

Each workflow only runs when files in its folder (`client/**` or `server/**`)
change, so a UI tweak won't redeploy the server and vice-versa. You can also
trigger either manually from the Actions tab ("Run workflow").

---

## One-time setup

### 1. Create the Lambda (fresh)

With the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
installed and configured (`aws configure`):

```bash
./server/scripts/bootstrap-lambda.sh
```

This creates the IAM role, the `stockjs-api` function (Node 22), and a public
**Function URL**, then prints the URL. It's idempotent — safe to re-run.

> **If you see `iam:CreateRole` AccessDenied:** your AWS user isn't allowed to
> create IAM roles (e.g. a permissions boundary on your account). Create the
> role once in the **Console** → IAM → Roles → Create role:
>
> - Trusted entity: **AWS service → Lambda**
> - Permissions: **AWSLambdaBasicExecutionRole**
> - Name: `stockjs-lambda-role`
>
> Then re-run the script with that role's ARN so it skips role creation:
>
> ```bash
> ROLE_ARN=arn:aws:iam::<account-id>:role/stockjs-lambda-role \
>   ./server/scripts/bootstrap-lambda.sh
> ```

### 2. Create an IAM user for CI

The GitHub Action needs credentials to update the function. Create an IAM user
with this minimal policy (replace the ARN region/account):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "lambda:UpdateFunctionCode",
      "Resource": "arn:aws:lambda:us-east-1:*:function:stockjs-api"
    }
  ]
}
```

Generate an access key for that user.

### 3. Add GitHub repo variables & secrets

Settings → Secrets and variables → Actions:

**Variables:**

| Name                   | Value                                  |
| ---------------------- | -------------------------------------- |
| `VITE_LAMBDA_URL`      | The Function URL from step 1           |
| `AWS_REGION`           | e.g. `us-east-1`                       |
| `LAMBDA_FUNCTION_NAME` | `stockjs-api`                          |

**Secrets:**

| Name                    | Value                          |
| ----------------------- | ------------------------------ |
| `AWS_ACCESS_KEY_ID`     | IAM user access key            |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key            |

### 4. Enable GitHub Pages via Actions

Settings → Pages → **Source: GitHub Actions**.

---

## After setup

Just push to `main`:

- Changes under `client/**` → rebuilt and published to
  `https://nnbrandon.github.io/stockjs`.
- Changes under `server/**` → zipped and pushed to the Lambda.

## Local development

```bash
# Terminal 1 — API on http://localhost:3001
cd server && npm install && npm run dev

# Terminal 2 — UI on http://localhost:5173
cd client && npm install && npm run dev
```

The client auto-targets `localhost:3001` in dev and `VITE_LAMBDA_URL` in
production builds.
