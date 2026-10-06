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

const BREVO_SMS_ENDPOINT = "https://api.brevo.com/v3/transactionalSMS/send";

export class SmsNotConfiguredError extends Error {}

export class SmsSendError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export const isSmsConfigured = (): boolean =>
  Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SMS_SENDER);

/**
 * SMS_DELIVERY=direct: don't send any SMS. The code is returned in the
 * request-otp response and the app fills it in for the user. The Brevo SMS
 * code stays in place; set SMS_DELIVERY=brevo (or remove it) to send real
 * SMS again.
 *
 * Warning: in this mode a code proves nothing about owning the number.
 * Anyone who types a registered number can log in to that account.
 */
export const isDirectOtpMode = (): boolean =>
  (process.env.SMS_DELIVERY || "").trim().toLowerCase() === "direct";

/** Mobile login is offered when SMS can really be sent (or in development,
 *  where codes are printed to the server log instead). */
export const isMobileLoginAvailable = (): boolean =>
  isDirectOtpMode() || isSmsConfigured() || process.env.NODE_ENV !== "production";

export const DEFAULT_SMS_TEMPLATE =
  "{code} is your Cricket Score Counter code. It expires in {minutes} minutes. Do not share it.";

export const buildOtpSms = (code: string, minutes: number): string =>
  (process.env.BREVO_SMS_TEMPLATE || DEFAULT_SMS_TEMPLATE)
    .replace(/\{code\}/g, code)
    .replace(/\{minutes\}/g, String(minutes));

/** `to` is E.164 (e.g. +919876543210); Brevo wants the digits only. */
export const sendSms = async (
  to: string,
  content: string,
  tag = "mobile_otp",
): Promise<void> => {
  if (!isSmsConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[sms] Brevo SMS not configured, SMS not sent.\nTo: ${to}\n${content}`);
      return;
    }
    throw new SmsNotConfiguredError("SMS service is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: globalThis.Response;
  try {
    response = await fetch(BREVO_SMS_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": process.env.BREVO_API_KEY as string,
      },
      body: JSON.stringify({
        sender: process.env.BREVO_SMS_SENDER,
        recipient: to.replace(/\D/g, ""),
        content,
        type: "transactional",
        tag,
        ...(process.env.BREVO_SMS_ORGANISATION_PREFIX
          ? { organisationPrefix: process.env.BREVO_SMS_ORGANISATION_PREFIX }
          : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new SmsSendError(
      controller.signal.aborted
        ? "Brevo SMS request timed out"
        : `Brevo SMS request failed: ${error instanceof Error ? error.message : error}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    // e.g. 402 not_enough_credits, 400 invalid_parameter
    throw new SmsSendError(
      `Brevo SMS ${response.status}${body.code ? ` ${body.code}` : ""}: ${body.message || "send failed"}`,
      response.status,
    );
  }
};
