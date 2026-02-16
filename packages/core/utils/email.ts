import { Resend } from "resend";
import { logMessage } from "./logs.js";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email using Resend
 * Requires RESEND_API_KEY env var
 */
export async function sendEmail(params: SendEmailParams): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "RESEND_API_KEY not configured",
      };
    }

    const resend = new Resend(apiKey);
    const fromEmail = params.from || process.env.RESEND_FROM_EMAIL || "noreply@superglue.cloud";

    await resend.emails.send({
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to superglue</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Hedvig+Letters+Serif:opsz@12..24&display=swap" rel="stylesheet">
        </head>
        <body style="margin: 0; padding: 0; font-family: YuGothic, 'Yu Gothic', sans-serif; background-color: #f9fafb;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #e5e7eb;">
                      <img src="https://superglue.cloud/logos/sg_logo.png" alt="superglue" style="height: 48px; margin-bottom: 16px;">
                    </td>
                  </tr>
                  
                  <!-- Body -->
                  <tr>
                    <td style="padding: 32px;">
                      <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #374151;">
                        Hi ${name || "there"},
                      </p>
                      
                      <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #374151;">
                        You've been invited to access the superglue portal to connect your accounts to enterprise systems. Use the button below to get started:
                      </p>
                      
                      <!-- CTA Button -->
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td style="text-align: center; padding: 8px 0 24px;">
                            <a href="${portalUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);">Access Portal</a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 0 0 16px; font-size: 14px; line-height: 20px; color: #6b7280;">
                        This link will remain valid for 30 days. If you need a new link, please contact your administrator.
                      </p>
                      
                      <!-- Info Box -->
                      <div style="background: #f3f4f6; border-left: 3px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 24px 0;">
                        <p style="margin: 0; font-size: 14px; line-height: 20px; color: #374151;">
                          <strong>What is superglue?</strong><br>
                          superglue is the control plane for enterprise systems. Through the portal, you can securely connect your accounts to systems like Salesforce, HubSpot, or Google Workspace. Once connected, AI agents and automation workflows can interact with these systems on your behalf—always using your credentials, never shared accounts.<br><br>
                          <a href="https://docs.superglue.cloud/enterprise/end-users#the-connection-portal" style="color: #f59e0b; text-decoration: none; font-weight: 500;">Learn more about the portal →</a>
                        </p>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 24px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
                      <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">
                        Best regards,<br>
                        <strong style="color: #374151;">The superglue Team</strong>
                      </p>
                      <p style="margin: 16px 0 0; font-size: 12px; color: #9ca3af; font-family: 'Hedvig Letters Serif', serif; font-style: italic;">
                        The Control Plane for Enterprise Systems
                      </p>
                    </td>
                  </tr>
                </table>
                
                <!-- Footer Links -->
                <table role="presentation" style="max-width: 600px; margin: 24px auto 0;">
                  <tr>
                    <td style="text-align: center;">
                      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                        <a href="https://superglue.cloud" style="color: #6b7280; text-decoration: none; margin: 0 8px;">Website</a>
                        <span style="color: #d1d5db;">•</span>
                        <a href="https://docs.superglue.cloud" style="color: #6b7280; text-decoration: none; margin: 0 8px;">Documentation</a>
                        <span style="color: #d1d5db;">•</span>
                        <a href="mailto:support@superglue.cloud" style="color: #6b7280; text-decoration: none; margin: 0 8px;">Support</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });
}
