"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OTP_ERROR_MESSAGES = exports.verifyEmailOtp = exports.issueEmailOtp = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = require("crypto");
const EmailOtp_1 = require("../models/EmailOtp");
const mailer_1 = require("./mailer");
const minutes = (value) => value * 60 * 1000;
const CODE_TTL_MINUTES = () => Number(process.env.EMAIL_OTP_EXPIRES_MINUTES || 10);
const MAX_ATTEMPTS = () => Number(process.env.EMAIL_OTP_MAX_ATTEMPTS || 5);
const RESEND_COOLDOWN_SECONDS = () => Number(process.env.EMAIL_OTP_RESEND_SECONDS || 60);
const MAX_SENDS_PER_HOUR = () => Number(process.env.EMAIL_OTP_MAX_SENDS_PER_HOUR || 5);
const SEND_WINDOW_MS = minutes(60);
const generateOtp = () => (0, crypto_1.randomInt)(0, 1000000).toString().padStart(6, "0");
const escapeHtml = (text) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const buildEmail = (purpose, otp, name) => {
    const ttl = CODE_TTL_MINUTES();
    const greeting = name ? `Hi ${name},` : "Hi,";
    const isVerify = purpose === "verify_email";
    const subject = isVerify
        ? `${otp} is your Cricket Score Counter verification code`
        : `${otp} is your Cricket Score Counter password reset code`;
    const intro = isVerify
        ? "Use this code to verify your email and finish creating your Cricket Score Counter account:"
        : "Use this code to reset your Cricket Score Counter password:";
    const outro = isVerify
        ? "If you didn't create an account, you can ignore this email."
        : "If you didn't ask to reset your password, you can ignore this email. Your password won't change.";
    const text = `${greeting}\n\n${intro}\n\n${otp}\n\nThe code expires in ${ttl} minutes.\n\n${outro}\n\nCricket Score Counter\nhttps://www.cricket-score-counter.com`;
    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#eef4fd;font-family:Arial,Helvetica,sans-serif;color:#0f3f66;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4fd;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#43cea2 0%,#185a9d 100%);background-color:#185a9d;padding:20px 24px;color:#ffffff;font-size:20px;font-weight:bold;">Cricket Score Counter</td></tr>
<tr><td style="padding:24px;">
<p style="margin:0 0 12px;font-size:16px;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5;">${intro}</p>
<p style="margin:0 0 20px;text-align:center;font-size:34px;letter-spacing:8px;font-weight:bold;color:#185a9d;background:#f0fbf7;border:1px solid #c9eee0;border-radius:12px;padding:14px 0;">${otp}</p>
<p style="margin:0 0 12px;font-size:14px;">The code expires in ${ttl} minutes.</p>
<p style="margin:0;font-size:13px;color:#5b6b7f;line-height:1.5;">${outro}</p>
</td></tr>
<tr><td style="padding:14px 24px;background:#f6f9fc;font-size:12px;color:#7a8a9c;">
<a href="https://www.cricket-score-counter.com" style="color:#185a9d;text-decoration:none;">cricket-score-counter.com</a>
</td></tr>
</table></td></tr></table>
</body></html>`;
    return { subject, text, html };
};
/**
 * Creates a fresh code for (email, purpose) and emails it, unless the last
 * code was sent too recently or the hourly send limit is reached.
 * Throws if the email can't be sent (the caller turns that into a 5xx).
 */
const issueEmailOtp = async (email, purpose, name) => {
    const now = Date.now();
    const existing = await EmailOtp_1.EmailOtp.findOne({ email, purpose });
    let sendCount = 0;
    let windowStart = new Date(now);
    if (existing) {
        const sinceLastSend = now - existing.lastSentAt.getTime();
        const cooldownMs = RESEND_COOLDOWN_SECONDS() * 1000;
        if (sinceLastSend < cooldownMs) {
            return {
                status: "cooldown",
                resendAfterSeconds: Math.ceil((cooldownMs - sinceLastSend) / 1000),
            };
        }
        if (now - existing.sendWindowStartedAt.getTime() < SEND_WINDOW_MS) {
            sendCount = existing.sendCount;
            windowStart = existing.sendWindowStartedAt;
        }
        if (sendCount >= MAX_SENDS_PER_HOUR()) {
            return {
                status: "limited",
                resendAfterSeconds: Math.ceil((windowStart.getTime() + SEND_WINDOW_MS - now) / 1000),
            };
        }
    }
    const otp = generateOtp();
    const otpHash = await bcryptjs_1.default.hash(otp, 10);
    const codeExpiresAt = new Date(now + minutes(CODE_TTL_MINUTES()));
    await EmailOtp_1.EmailOtp.findOneAndUpdate({ email, purpose }, {
        email,
        purpose,
        otpHash,
        codeExpiresAt,
        expiresAt: new Date(Math.max(codeExpiresAt.getTime(), windowStart.getTime() + SEND_WINDOW_MS)),
        attempts: 0,
        lastSentAt: new Date(now),
        sendCount: sendCount + 1,
        sendWindowStartedAt: windowStart,
    }, { upsert: true, setDefaultsOnInsert: true });
    try {
        await (0, mailer_1.sendMail)(Object.assign({ to: email, tags: [purpose] }, buildEmail(purpose, otp, name)));
    }
    catch (error) {
        // Let the user retry straight away instead of waiting out the cooldown
        // for an email that never arrived.
        await EmailOtp_1.EmailOtp.updateOne({ email, purpose }, { lastSentAt: new Date(0), $inc: { sendCount: -1 } });
        throw error;
    }
    return { status: "sent", resendAfterSeconds: RESEND_COOLDOWN_SECONDS() };
};
exports.issueEmailOtp = issueEmailOtp;
/** Checks a code. A correct code is consumed so it can't be reused. */
const verifyEmailOtp = async (email, purpose, otp) => {
    const record = await EmailOtp_1.EmailOtp.findOne({ email, purpose }).select("+otpHash");
    if (!record || !record.otpHash)
        return "expired";
    if (record.codeExpiresAt.getTime() < Date.now())
        return "expired";
    if (record.attempts >= MAX_ATTEMPTS())
        return "too_many_attempts";
    const matches = /^\d{6}$/.test(otp) && (await bcryptjs_1.default.compare(otp, record.otpHash));
    if (!matches) {
        record.attempts += 1;
        await record.save();
        return record.attempts >= MAX_ATTEMPTS() ? "too_many_attempts" : "invalid";
    }
    // Consume the code but keep the doc (with its send counters) until its TTL.
    await EmailOtp_1.EmailOtp.updateOne({ _id: record._id }, { codeExpiresAt: new Date(0), attempts: 0 });
    return "ok";
};
exports.verifyEmailOtp = verifyEmailOtp;
exports.OTP_ERROR_MESSAGES = {
    invalid: "That code isn't right. Check the email and try again.",
    expired: "That code has expired. Request a new one.",
    too_many_attempts: "Too many wrong attempts. Request a new code.",
};
//# sourceMappingURL=emailOtp.js.map