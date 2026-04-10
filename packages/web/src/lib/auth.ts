import { betterAuth } from "better-auth";
import { verifyPassword as verifyScryptPassword } from "better-auth/crypto";
import { organization, jwt } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import pg from "pg";
import { sendEmail } from "@superglue/core/utils/email";
import { EESuperglueClient } from "./ee-superglue-client";

export interface SuperglueJWTClaims {
  sub: string;
  email: string;
  orgId: string;
  orgName: string;
  orgStatus: string;
}

export const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USERNAME,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  ssl: process.env.POSTGRES_SSL === "false" ? undefined : { rejectUnauthorized: false },
});

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.SUPERGLUE_APP_URL,
  secret: process.env.JWT_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    password: {
      // Support both scrypt (better-auth default) and bcrypt (migrated from Supabase).
      // New passwords use better-auth's default scrypt hash; this only overrides verify.
      verify: async ({ hash, password }) => {
        if (hash.startsWith("$2a$") || hash.startsWith("$2b$")) {
          return bcrypt.compare(password, hash);
        }
        // Default scrypt verification (salt:key hex format)
        return verifyScryptPassword({ hash, password });
      },
    },
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your superglue password",
        html: `<p>Click the link below to reset your password:</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      });
    },
  },
  socialProviders,
  session: {
    expiresIn: 7 * 24 * 60 * 60, // 7 days (matches Supabase default)
    updateAge: 24 * 60 * 60, // Extend session on activity every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60, // 1 hour — DB lookup only after cache expires
    },
  },
  advanced: {
    cookiePrefix: "ba",
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // Auto-set active org so every session has orgId from the start
          if (session.activeOrganizationId) return { data: session };

          const result = await pool.query(
            `SELECT "organizationId" FROM "member" WHERE "userId" = $1 LIMIT 1`,
            [session.userId],
          );
          const orgId = result.rows[0]?.organizationId || null;
          return { data: { ...session, activeOrganizationId: orgId } };
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          const apiEndpoint = process.env.API_SERVER_URL || process.env.API_ENDPOINT;
          if (!apiEndpoint) return;

          try {
            const client = new EESuperglueClient({
              apiKey: process.env.USER_ADMIN_SECRET,
              apiEndpoint,
            });
            await client.initializeUser({ userId: user.id, email: user.email });
          } catch (err) {
            console.error("Failed to initialize user:", err);
          }
        },
      },
    },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 1000,
      organizationCreation: {
        additionalFields: {
          status: {
            type: "string",
            required: false,
            defaultValue: "free",
            input: false,
          },
        },
      },
      schema: {
        organization: {
          modelName: "organization",
        },
        member: {
          modelName: "member",
        },
        invitation: {
          modelName: "invitation",
        },
      },
      organizationHooks: {
        async afterAcceptInvitation({ member, organization, invitation }) {
          const apiEndpoint = process.env.API_SERVER_URL || process.env.API_ENDPOINT;
          if (!apiEndpoint) return;

          try {
            const client = new EESuperglueClient({
              apiKey: process.env.USER_ADMIN_SECRET,
              apiEndpoint,
            });
            const roleId = invitation.role === "admin" ? "admin" : "member";
            await client.assignOrgRole({
              userId: member.userId,
              orgId: organization.id,
              roleId,
            });
          } catch (err) {
            console.error("Failed to assign RBAC role after invite acceptance:", err);
          }
        },
      },
    }),
    jwt({
      jwt: {
        expirationTime: "1h", // 1 hour — refreshed client-side well before expiry
        definePayload: async ({ user, session }) => {
          const orgId = session.activeOrganizationId || "";
          let orgName = "";
          let orgStatus = "free";
          if (orgId) {
            const result = await pool.query(`SELECT name, status FROM organization WHERE id = $1`, [
              orgId,
            ]);
            orgName = result.rows[0]?.name || "";
            orgStatus = result.rows[0]?.status || "";
          }
          return { sub: user.id, email: user.email, orgId, orgName, orgStatus };
        },
      },
    }),
  ],
  trustedOrigins: process.env.SUPERGLUE_APP_URL ? [process.env.SUPERGLUE_APP_URL] : [],
});

export type Session = typeof auth.$Infer.Session;
