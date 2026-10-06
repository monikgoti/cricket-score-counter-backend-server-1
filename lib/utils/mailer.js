"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMailTransporterForTests = exports.sendMail = exports.MailerSendError = exports.isMailerConfigured = exports.MailerNotConfiguredError = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
/**
 * Sends transactional email.
 *
 * Provider 1 (preferred): Brevo's transactional email API, used whenever
 * BREVO_API_KEY is set. Free plan: 300 emails/day.
 *   BREVO_API_KEY=xkeysib-...
 *   BREVO_SENDER_EMAIL=no-reply@your-domain.com   (a sender verified in Brevo)
 *   BREVO_SENDER_NAME=Cricket Score Counter
 *
 * Provider 2 (fallback): any SMTP server via Nodemailer. The free option is
 * Gmail with an App
 * Password (Google Account → Security → 2-Step Verification → App
 * passwords), which allows roughly 500 emails a day:
 *
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=465
 *   SMTP_USER=you@gmail.com
 *   SMTP_PASS=<16-character app password>
 *   MAIL_FROM="Cricket Score Counter <you@gmail.com>"
 *
 * Without SMTP_USER/SMTP_PASS, emails are printed to the server log in
 * development and rejected in production (see isMailerConfigured).
 */
class MailerNotConfiguredError extends Error {
}
exports.MailerNotConfiguredError = MailerNotConfiguredError;
let transporter = null;
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const isBrevoConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
const isSmtpConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
const isMailerConfigured = () => isBrevoConfigured() || isSmtpConfigured();
exports.isMailerConfigured = isMailerConfigured;
const getTransporter = () => {
    if (transporter)
        return transporter;
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer_1.default.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port,
        // 465 = implicit TLS; 587 = STARTTLS (secure: false, upgraded by Nodemailer).
        secure: process.env.SMTP_SECURE !== undefined
            ? process.env.SMTP_SECURE === "true"
            : port === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        // Fail fast instead of hanging a request when SMTP is unreachable.
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    });
    return transporter;
};
class MailerSendError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
exports.MailerSendError = MailerSendError;
const sendWithBrevo = async (message) => {
    var _a;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
        response = await fetch(BREVO_ENDPOINT, {
            method: "POST",
            headers: {
                accept: "application/json",
                "content-type": "application/json",
                "api-key": process.env.BREVO_API_KEY,
            },
            body: JSON.stringify(Object.assign({ sender: {
                    email: process.env.BREVO_SENDER_EMAIL,
                    name: process.env.BREVO_SENDER_NAME || "Cricket Score Counter",
                }, to: [{ email: message.to }], subject: message.subject, htmlContent: message.html, textContent: message.text }, (((_a = message.tags) === null || _a === void 0 ? void 0 : _a.length) ? { tags: message.tags } : {}))),
            signal: controller.signal,
        });
    }
    catch (error) {
        throw new MailerSendError(controller.signal.aborted
            ? "Brevo request timed out"
            : `Brevo request failed: ${error instanceof Error ? error.message : error}`);
    }
    finally {
        clearTimeout(timeout);
    }
    if (!response.ok) {
        // Brevo errors look like { "code": "unauthorized", "message": "Key not found" }.
        const body = (await response.json().catch(() => ({})));
        throw new MailerSendError(`Brevo ${response.status}${body.code ? ` ${body.code}` : ""}: ${body.message || "send failed"}`, response.status);
    }
};
const sendMail = async (message) => {
    if (!(0, exports.isMailerConfigured)()) {
        if (process.env.NODE_ENV !== "production") {
            console.log(`[mailer] No email provider configured (BREVO_API_KEY or SMTP), email not sent.\nTo: ${message.to}\nSubject: ${message.subject}\n${message.text}`);
            return;
        }
        throw new MailerNotConfiguredError("Email service is not configured");
    }
    if (isBrevoConfigured()) {
        await sendWithBrevo(message);
        return;
    }
    const { tags: _tags } = message, smtpMessage = __rest(message, ["tags"]);
    await getTransporter().sendMail(Object.assign({ from: process.env.MAIL_FROM || `Cricket Score Counter <${process.env.SMTP_USER}>` }, smtpMessage));
};
exports.sendMail = sendMail;
/** Lets tests swap in a fake transport (e.g. Nodemailer's jsonTransport). */
const setMailTransporterForTests = (fake) => {
    transporter = fake;
};
exports.setMailTransporterForTests = setMailTransporterForTests;
//# sourceMappingURL=mailer.js.map