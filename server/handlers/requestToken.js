// Emails a fresh sync token to the requesting address (action=requestToken).
// Flow: the user types their email in the app → this generates a random
// token, stores only its sha256 hash at tokens/<email>.json, and emails the
// token to that address. Possession of the token then proves ownership of
// the inbox, and it only unlocks that email's own portfolio.
//
// First-time addresses can't receive anything while the SES account is in
// sandbox mode, so the first call kicks off SES verification instead and
// reports verificationSent — the user clicks the AWS link, then requests
// again. Each successful request replaces the previous token.
//
// Abuse surface: anyone who finds the Function URL can trigger emails to an
// arbitrary address (a verification email, or a token email to an inbox they
// control — which only ever unlocks that same inbox's portfolio). Acceptable
// for a personal app; add rate limiting before opening this to real traffic.

import { randomBytes } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { errorResponse, jsonResponse } from "../lib/response.js";
import {
  ensureEmailVerification,
  normalizeEmail,
  sha256Hex,
  tokenKeyForEmail,
} from "./portfolioSync.js";

const s3 = new S3Client({});

export async function requestSyncToken(body, corsOrigin) {
  const bucket = process.env.REPORT_STATE_BUCKET || "";
  const sender = process.env.REPORT_EMAIL || "";
  if (!bucket || !sender) {
    return errorResponse(
      503,
      "Portfolio sync is not configured on the server",
      corsOrigin,
    );
  }

  const email = normalizeEmail(body?.email);
  if (!email) {
    return errorResponse(400, "A valid email address is required", corsOrigin);
  }

  const verified = await ensureEmailVerification(email);
  if (verified !== true) {
    // The SES sandbox can't deliver to this address yet — the verification
    // email is on its way (or already sitting in their inbox).
    console.log(`requestToken: ${email} not verified yet — no token sent`);
    return jsonResponse(200, { ok: true, verificationSent: true }, corsOrigin);
  }

  const token = randomBytes(24).toString("hex");

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: tokenKeyForEmail(email),
        Body: JSON.stringify({
          version: 1,
          email,
          tokenHash: sha256Hex(token),
          createdAt: new Date().toISOString(),
        }),
        ContentType: "application/json",
      }),
    );
  } catch (err) {
    console.error("requestToken: S3 write failed:", err);
    return errorResponse(502, "Failed to create sync token", corsOrigin);
  }

  try {
    // Lazy import so ordinary API requests never pay for the SES client.
    const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");
    const ses = new SESClient({});
    await ses.send(
      new SendEmailCommand({
        Source: sender,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: "Your stockjs sync token", Charset: "UTF-8" },
          Body: {
            Text: {
              Data: [
                "Here is your stockjs portfolio sync token:",
                "",
                token,
                "",
                "Paste it into the app (sidebar → Sync email report) to link",
                "your holdings to the daily email. This replaces any token you",
                "requested before. If you didn't ask for this, you can ignore it.",
              ].join("\n"),
              Charset: "UTF-8",
            },
            Html: {
              Data: `<p>Here is your stockjs portfolio sync token:</p>
<p style="font-family:monospace;font-size:15px;background:#f6f8fa;padding:10px 12px;border-radius:6px;display:inline-block;">${token}</p>
<p>Paste it into the app (sidebar → <strong>Sync email report</strong>) to link your holdings to the daily email. This replaces any token you requested before. If you didn't ask for this, you can ignore it.</p>`,
              Charset: "UTF-8",
            },
          },
        },
      }),
    );
  } catch (err) {
    console.error("requestToken: SES send failed:", err);
    return errorResponse(502, "Failed to email the sync token", corsOrigin);
  }

  console.log(`requestToken: token emailed to ${email}`);
  return jsonResponse(200, { ok: true, tokenSent: true }, corsOrigin);
}
