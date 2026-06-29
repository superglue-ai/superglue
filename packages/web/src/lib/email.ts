import nodemailer from "nodemailer";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email via the local sendmail transport (like PHP's mail()).
 *
 * Inlined into the web package so the web-only Docker image does not depend on
 * @superglue/core (which pulls in Deno/Playwright and is excluded from that image).
 */
export async function sendEmail(params: SendEmailParams): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const transporter = nodemailer.createTransport({
      sendmail: true,
      newline: "unix",
    });

    await transporter.sendMail({
      from: params.from || "noreply@superglue.cloud",
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    return { success: true };
  } catch (error) {
    console.error(`Failed to send email: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
