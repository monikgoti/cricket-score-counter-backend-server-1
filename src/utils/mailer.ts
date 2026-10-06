import nodemailer, { type Transporter } from "nodemailer";

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

export class MailerNotConfiguredError extends Error {}

let transporter: Transporter | null = null;

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const isBrevoConfigured = (): boolean =>
  Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);

const isSmtpConfigured = (): boolean =>
  Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

export const isMailerConfigured = (): boolean =>
  isBrevoConfigured() || isSmtpConfigured();

const getTransporter = (): Transporter => {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    // 465 = implicit TLS; 587 = STARTTLS (secure: false, upgraded by Nodemailer).
    secure:
      process.env.SMTP_SECURE !== undefined
        ? process.env.SMTP_SECURE === "true"
        : port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Fail fast instead of hanging a request when SMTP is unreachable.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
};

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Shown in Brevo's logs/statistics to group emails, e.g. ["verify_email"]. */
  tags?: string[];
};

export class MailerSendError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

const sendWithBrevo = async (message: MailMessage): Promise<void> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: globalThis.Response;
  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": process.env.BREVO_API_KEY as string,
      },
      body: JSON.stringify({
        sender: {
          email: process.env.BREVO_SENDER_EMAIL,
          name: process.env.BREVO_SENDER_NAME || "Cricket Score Counter",
        },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        ...(message.tags?.length ? { tags: message.tags } : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new MailerSendError(
      controller.signal.aborted
        ? "Brevo request timed out"
        : `Brevo request failed: ${error instanceof Error ? error.message : error}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // Brevo errors look like { "code": "unauthorized", "message": "Key not found" }.
    const body = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    throw new MailerSendError(
      `Brevo ${response.status}${body.code ? ` ${body.code}` : ""}: ${body.message || "send failed"}`,
      response.status,
    );
  }
};

export const sendMail = async (message: MailMessage): Promise<void> => {
  if (!isMailerConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[mailer] No email provider configured (BREVO_API_KEY or SMTP), email not sent.\nTo: ${message.to}\nSubject: ${message.subject}\n${message.text}`,
      );
      return;
    }
    throw new MailerNotConfiguredError("Email service is not configured");
  }

  if (isBrevoConfigured()) {
    await sendWithBrevo(message);
    return;
  }

  const { tags: _tags, ...smtpMessage } = message;
  await getTransporter().sendMail({
    from:
      process.env.MAIL_FROM || `Cricket Score Counter <${process.env.SMTP_USER}>`,
    ...smtpMessage,
  });
};

/** Lets tests swap in a fake transport (e.g. Nodemailer's jsonTransport). */
export const setMailTransporterForTests = (fake: Transporter | null): void => {
  transporter = fake;
};
