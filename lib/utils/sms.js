"use strict";
/**
 * Sends SMS through Brevo's transactional SMS API
 * (POST https://api.brevo.com/v3/transactionalSMS/send).
 *
 *   BREVO_API_KEY=xkeysib-...          (same key as email)
 *   BREVO_SMS_SENDER=CRKTSC            (max 11 letters/digits, or 15 digits;
 *                                       must be approved in Brevo, and for
 *                                       India registered on DLT)
 *   BREVO_SMS_TEMPLATE="{code} is your Cricket Score Counter code. It expires in {minutes} minutes. Do not share it."
 *                                      (optional; for India it must match
 *                                       your DLT-approved template exactly)
 *   BREVO_SMS_ORGANISATION_PREFIX=     (optional brand prefix)
 *
 * SMS costs Brevo credits, unlike the free email plan.
 * Without BREVO_SMS_SENDER, messages are printed to the server log in
 * development and refused in production.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSms = exports.buildOtpSms = exports.DEFAULT_SMS_TEMPLATE = exports.isMobileLoginAvailable = exports.isDirectOtpMode = exports.isSmsConfigured = exports.SmsSendError = exports.SmsNotConfiguredError = void 0;
const BREVO_SMS_ENDPOINT = "https://api.brevo.com/v3/transactionalSMS/send";
class SmsNotConfiguredError extends Error {
}
exports.SmsNotConfiguredError = SmsNotConfiguredError;
class SmsSendError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
exports.SmsSendError = SmsSendError;
const isSmsConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SMS_SENDER);
exports.isSmsConfigured = isSmsConfigured;
/**
 * SMS_DELIVERY=direct: don't send any SMS. The code is returned in the
 * request-otp response and the app fills it in for the user. The Brevo SMS
 * code stays in place; set SMS_DELIVERY=brevo (or remove it) to send real
 * SMS again.
 *
 * Warning: in this mode a code proves nothing about owning the number.
 * Anyone who types a registered number can log in to that account.
 */
const isDirectOtpMode = () => (process.env.SMS_DELIVERY || "").trim().toLowerCase() === "direct";
exports.isDirectOtpMode = isDirectOtpMode;
/** Mobile login is offered when SMS can really be sent (or in development,
 *  where codes are printed to the server log instead). */
const isMobileLoginAvailable = () => (0, exports.isDirectOtpMode)() || (0, exports.isSmsConfigured)() || process.env.NODE_ENV !== "production";
exports.isMobileLoginAvailable = isMobileLoginAvailable;
exports.DEFAULT_SMS_TEMPLATE = "{code} is your Cricket Score Counter code. It expires in {minutes} minutes. Do not share it.";
const buildOtpSms = (code, minutes) => (process.env.BREVO_SMS_TEMPLATE || exports.DEFAULT_SMS_TEMPLATE)
    .replace(/\{code\}/g, code)
    .replace(/\{minutes\}/g, String(minutes));
exports.buildOtpSms = buildOtpSms;
/** `to` is E.164 (e.g. +919876543210); Brevo wants the digits only. */
const sendSms = async (to, content, tag = "mobile_otp") => {
    if (!(0, exports.isSmsConfigured)()) {
        if (process.env.NODE_ENV !== "production") {
            console.log(`[sms] Brevo SMS not configured, SMS not sent.\nTo: ${to}\n${content}`);
            return;
        }
        throw new SmsNotConfiguredError("SMS service is not configured");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
        response = await fetch(BREVO_SMS_ENDPOINT, {
            method: "POST",
            headers: {
                accept: "application/json",
                "content-type": "application/json",
                "api-key": process.env.BREVO_API_KEY,
            },
            body: JSON.stringify(Object.assign({ sender: process.env.BREVO_SMS_SENDER, recipient: to.replace(/\D/g, ""), content, type: "transactional", tag }, (process.env.BREVO_SMS_ORGANISATION_PREFIX
                ? { organisationPrefix: process.env.BREVO_SMS_ORGANISATION_PREFIX }
                : {}))),
            signal: controller.signal,
        });
    }
    catch (error) {
        throw new SmsSendError(controller.signal.aborted
            ? "Brevo SMS request timed out"
            : `Brevo SMS request failed: ${error instanceof Error ? error.message : error}`);
    }
    finally {
        clearTimeout(timeout);
    }
    if (!response.ok) {
        const body = (await response.json().catch(() => ({})));
        // e.g. 402 not_enough_credits, 400 invalid_parameter
        throw new SmsSendError(`Brevo SMS ${response.status}${body.code ? ` ${body.code}` : ""}: ${body.message || "send failed"}`, response.status);
    }
};
exports.sendSms = sendSms;
//# sourceMappingURL=sms.js.map