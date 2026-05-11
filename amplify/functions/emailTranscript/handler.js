// POST /api/email-transcript — send a conversation transcript via SMTP.

import nodemailer from "nodemailer";
import {
  checkRateLimit,
  rateLimitedResponse,
} from "../../../lib/rateLimit.js";
import { json, parseBody, method } from "../../../lib/lambda.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TRANSCRIPT_LENGTH = 500;
const MAX_TEXT_LENGTH = 5000;
const MAX_FIELD_LENGTH = 200;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml({ visitorName, visitorCompany, transcript, sentAt }) {
  const messageRows = transcript
    .map((m) => {
      const role = m.role === "user" ? "You" : "Avatar";
      const align = m.role === "user" ? "right" : "left";
      const bg = m.role === "user" ? "#fee2e2" : "#f3f4f6";
      const safeText = escapeHtml(m.text).replace(/\n/g, "<br>");
      return `
        <tr><td style="text-align:${align};padding:6px 0;">
          <div style="display:inline-block;max-width:85%;padding:8px 12px;background:${bg};border-radius:8px;text-align:left;font-size:14px;">
            <div style="font-weight:600;color:#666;font-size:11px;margin-bottom:2px;">${escapeHtml(role)}</div>
            <div>${safeText}</div>
          </div>
        </td></tr>`;
    })
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Your conversation with the ZAPTEST avatar</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;margin:0;padding:24px;color:#1a1a1a;">
  <table style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <tr><td style="padding:24px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0;font-size:18px;">Your conversation with the ZAPTEST avatar</h2>
      <p style="margin:6px 0 0;color:#666;font-size:13px;">${escapeHtml(visitorName)}${visitorCompany ? ` &middot; ${escapeHtml(visitorCompany)}` : ""}</p>
      <p style="margin:4px 0 0;color:#999;font-size:12px;">${escapeHtml(sentAt)}</p>
    </td></tr>
    <tr><td style="padding:16px 24px;">
      <table style="width:100%;border-collapse:collapse;">${messageRows}</table>
    </td></tr>
    <tr><td style="padding:14px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#999;">
      Sent automatically by ZAPTEST. Do not reply to this email.
    </td></tr>
  </table>
</body></html>`;
}

function buildText({ visitorName, visitorCompany, transcript, sentAt }) {
  const lines = transcript.map(
    (m) => `${m.role === "user" ? "You" : "Avatar"}: ${m.text}`,
  );
  return [
    "Your conversation with the ZAPTEST avatar",
    `${visitorName}${visitorCompany ? ` · ${visitorCompany}` : ""}`,
    sentAt,
    "",
    ...lines,
    "",
    "---",
    "Sent automatically by ZAPTEST. Do not reply to this email.",
  ].join("\n");
}

export const handler = async (event) => {
  if (method(event) !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const rl = checkRateLimit(event, {
    windowMs: 60 * 60 * 1000,
    max: 5,
    key: "email-transcript",
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter);

  const payload = parseBody(event);
  if (payload === null) return json(400, { error: "invalid_json" });

  const { to, transcript, visitor } = payload;
  if (typeof to !== "string" || !EMAIL_REGEX.test(to)) {
    return json(400, { error: "invalid_email" });
  }
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return json(400, { error: "empty_transcript" });
  }
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return json(400, { error: "transcript_too_long" });
  }

  const cleanTranscript = transcript
    .map((m) => ({
      role: m && m.role === "user" ? "user" : "avatar",
      text:
        typeof m?.text === "string" ? m.text.slice(0, MAX_TEXT_LENGTH) : "",
    }))
    .filter((m) => m.text.length > 0);
  if (cleanTranscript.length === 0) {
    return json(400, { error: "empty_transcript" });
  }

  const visitorName = String(visitor?.name ?? "Visitor").slice(
    0,
    MAX_FIELD_LENGTH,
  );
  const visitorCompany = String(visitor?.company ?? "").slice(
    0,
    MAX_FIELD_LENGTH,
  );
  const sentAt = `${new Date().toISOString()} UTC`;

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM_EMAIL,
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM_EMAIL) {
    return json(500, { error: "missing_smtp_env" });
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });

  const data = { visitorName, visitorCompany, transcript: cleanTranscript, sentAt };

  try {
    await transporter.sendMail({
      from: `"ZAPTEST" <${SMTP_FROM_EMAIL}>`,
      to,
      subject: "Your conversation with the ZAPTEST avatar",
      text: buildText(data),
      html: buildHtml(data),
    });
    return json(200, { ok: true });
  } catch (err) {
    console.error("email-transcript send failed", err);
    return json(502, {
      error: "send_failed",
      message: String(err?.message || err),
    });
  }
};
