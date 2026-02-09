import { EmailNotifier } from "../../notifications/notifiers/email-notifier.js";
import { logMessage } from "../../utils/logs.js";
import { getUserEmailById } from "../../utils/user-lookup.js";
import { registerApiModule } from "../registry.js";
import { addTraceHeader, sendError } from "../response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "../types.js";

interface SendEmailRequest {
  subject: string;
  body: string;
}

const sendEmail: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as SendEmailRequest;
  const metadata = authReq.toMetadata();

  if (!body.subject || !body.body) {
    return sendError(reply, 400, "Missing required fields: subject and body");
  }

  // Look up user email by userId
  const userEmail = authReq.authInfo.userId
    ? await getUserEmailById(authReq.authInfo.userId)
    : null;

  if (!userEmail) {
    return sendError(reply, 400, "No email associated with this API key");
  }

  try {
    const notifier = new EmailNotifier({
      recipientEmail: userEmail,
    });

    const result = await notifier.sendCustom(body.subject, body.body);

    if (!result.success) {
      logMessage("error", `Email send failed: ${result.error}`, metadata);
      return sendError(reply, 500, result.error || "Failed to send email");
    }

    logMessage("info", `Email sent to ${userEmail}`, metadata);

    return addTraceHeader(reply, authReq.traceId).code(200).send({
      success: true,
      message: "Email sent successfully",
      recipient: userEmail,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage("error", `Email send error: ${errorMessage}`, metadata);
    return sendError(reply, 500, errorMessage);
  }
};

registerApiModule({
  name: "notify-email",
  routes: [
    {
      method: "POST",
      path: "/notify/email",
      handler: sendEmail,
      permissions: { type: "execute", resource: "email", allowRestricted: true },
    },
  ],
});
