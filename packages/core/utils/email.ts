import { logMessage } from "./logs.js";
import nodemailer from "nodemailer";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email using sendmail (like PHP mail() function)
 * Just works - no configuration needed!
 */
export async function sendEmail(params: SendEmailParams): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Use sendmail - just like PHP times!
    // nodemailer will automatically find sendmail in standard paths
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
    logMessage("error", `Failed to send email: ${error}`, {});
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Notify stefan@superglue.ai when a new self-hosted user signs up
 */
export async function sendSelfHostedSignupNotification(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: "stefan@superglue.ai",
    subject: "New Self-Hosted Superglue Signup",
    html: `
      <h2>New Self-Hosted User Signup</h2>
      <p>A new user has signed up on a self-hosted Superglue instance and wants to receive security updates:</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
    `,
  });
}

/**
 * Send a portal invitation email to an end user
 */
export async function sendPortalInvitationEmail(params: {
  to: string;
  name?: string;
  portalUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, name, portalUrl } = params;

  return sendEmail({
    to,
    subject: "Connect your accounts in superglue",
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #faf9f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #faf9f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e8e6e3;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #e8e6e3;">
              <img src="https://superglue.cloud/logos/sg_logo.png" alt="superglue" height="48" style="height: 48px;">
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #1a1a1a; text-align: center;">
                Connect Your Accounts
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a; text-align: center;">
                Hi ${name || "there"}, you've been invited to access the superglue portal to connect your accounts to enterprise systems.
              </p>
              
              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px 0;">
                    <a href="${portalUrl}" style="display: inline-block; padding: 14px 32px; background-color: #1a1a1a; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500;">
                      Access Portal
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Info Box -->
              <div style="background: #f5f5f4; border-left: 3px solid #1a1a1a; padding: 16px; border-radius: 0 6px 6px 0; margin: 0 0 24px 0;">
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #4a4a4a;">
                  <strong style="color: #1a1a1a;">What is superglue?</strong><br>
                  Through the portal, you can securely connect your accounts to systems like Salesforce, HubSpot, or Google Workspace. Once connected, AI agents and automation workflows can interact with these systems on your behalf.
                </p>
              </div>
              
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #8a8a8a; text-align: center;">
                This link will remain valid for 30 days.<br>
                If you didn't expect this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e8e6e3; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #8a8a8a;">
                superglue · The Agentic Integration Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });
}

/**
 * Send an organization invitation email to a user
 */
export async function sendOrgInvitationEmail(params: {
  to: string;
  orgName: string;
  inviteUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, orgName, inviteUrl } = params;

  return sendEmail({
    to,
    subject: `You've been invited to join ${orgName} on superglue`,
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #faf9f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #faf9f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e8e6e3;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #e8e6e3;">
              <img src="https://superglue.cloud/logos/sg_logo.png" alt="superglue" height="48" style="height: 48px;">
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #1a1a1a; text-align: center;">
                You're invited
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a; text-align: center;">
                You've been invited to join <strong style="color: #1a1a1a;">${orgName}</strong> on superglue — the agentic integration platform.
              </p>
              
              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px 0;">
                    <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background-color: #1a1a1a; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #8a8a8a; text-align: center;">
                This invitation will expire in 24 hours.<br>
                If you didn't expect this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e8e6e3; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #8a8a8a;">
                superglue · The Agentic Integration Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });
}
