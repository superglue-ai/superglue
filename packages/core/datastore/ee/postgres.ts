import type {
  EndUser,
  EndUserInput,
  OrgInvitation,
  PortalToken,
  Role,
  RoleInput,
} from "@superglue/shared";
import { isPredefinedRole } from "@superglue/shared";
import crypto from "crypto";
import type { PoolConfig } from "pg";
import { PostgresService } from "../postgres.js";
import { credentialEncryption } from "../../utils/encryption.js";
import { logMessage } from "../../utils/logs.js";
import type { EEDataStore } from "./types.js";

/**
 * EE-extended PostgresService with multi-tenancy support.
 * Extends the base PostgresService with end-user credential management.
 */
export class EEPostgresService extends PostgresService implements EEDataStore {
  constructor(config: PoolConfig) {
    super(config);
    // Chain EE table initialization after parent tables are created
    this.initPromise = this.initPromise.then(() => this.initializeEETables());
  }

  /**
   * Initialize EE-specific tables for multi-tenancy support.
   * Uses CREATE TABLE IF NOT EXISTS for idempotent initialization.
   */
  private async initializeEETables(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // End users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS sg_end_users (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          org_id TEXT NOT NULL,
          external_id TEXT NOT NULL,
          email TEXT,
          name TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(org_id, external_id)
        )
      `);

      // End user credentials table
      await client.query(`
        CREATE TABLE IF NOT EXISTS sg_end_user_credentials (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          end_user_id TEXT NOT NULL REFERENCES sg_end_users(id) ON DELETE CASCADE,
          system_id TEXT NOT NULL,
          org_id TEXT NOT NULL,
          credentials JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(end_user_id, system_id)
        )
      `);

      // Portal tokens table for magic link authentication
      await client.query(`
        CREATE TABLE IF NOT EXISTS sg_portal_tokens (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          token TEXT NOT NULL UNIQUE,
          end_user_id TEXT NOT NULL REFERENCES sg_end_users(id) ON DELETE CASCADE,
          org_id TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Roles table with embedded access rules as JSONB
      await client.query(`
        CREATE TABLE IF NOT EXISTS sg_roles (
          id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
          org_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          access_rules JSONB NOT NULL DEFAULT '{}',
          is_base_role BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (id, org_id)
        )
      `);

      // User-to-role assignments (member_user_id for admin/member, end_user_id for enduser)
      await client.query(`
        CREATE TABLE IF NOT EXISTS sg_user_role_assignments (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          member_user_id TEXT,
          end_user_id TEXT,
          role_id TEXT NOT NULL,
          org_id TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          user_id TEXT GENERATED ALWAYS AS (COALESCE(member_user_id, end_user_id)) STORED,
          CONSTRAINT chk_exactly_one_user CHECK (
            (member_user_id IS NOT NULL AND end_user_id IS NULL) OR
            (member_user_id IS NULL AND end_user_id IS NOT NULL)
          ),
          CONSTRAINT fk_end_user FOREIGN KEY (end_user_id) REFERENCES sg_end_users(id) ON DELETE CASCADE,
          -- TODO: Re-enable FK once better-auth member row is guaranteed to exist before role assignment
          -- CONSTRAINT fk_member_user FOREIGN KEY (member_user_id, org_id) REFERENCES member("userId", "organizationId") ON DELETE CASCADE,
          FOREIGN KEY (role_id, org_id) REFERENCES sg_roles(id, org_id) ON DELETE CASCADE,
          UNIQUE(member_user_id, role_id, org_id),
          UNIQUE(end_user_id, role_id, org_id)
        )
      `);

      // better-auth: users
      await client.query(`
        CREATE TABLE IF NOT EXISTS "user" (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          name TEXT,
          email TEXT NOT NULL UNIQUE,
          "emailVerified" BOOLEAN DEFAULT FALSE,
          image TEXT,
          "createdAt" TIMESTAMPTZ DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // better-auth: sessions
      await client.query(`
        CREATE TABLE IF NOT EXISTS "session" (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
          token TEXT NOT NULL UNIQUE,
          "expiresAt" TIMESTAMPTZ NOT NULL,
          "ipAddress" TEXT,
          "userAgent" TEXT,
          "createdAt" TIMESTAMPTZ DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
          "activeOrganizationId" TEXT
        )
      `);

      // better-auth: accounts (OAuth + credential links)
      await client.query(`
        CREATE TABLE IF NOT EXISTS "account" (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
          "accountId" TEXT NOT NULL,
          "providerId" TEXT NOT NULL,
          "accessToken" TEXT,
          "refreshToken" TEXT,
          "accessTokenExpiresAt" TIMESTAMPTZ,
          "refreshTokenExpiresAt" TIMESTAMPTZ,
          scope TEXT,
          "idToken" TEXT,
          password TEXT,
          "createdAt" TIMESTAMPTZ DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // better-auth: verification tokens (password reset, email verification)
      await client.query(`
        CREATE TABLE IF NOT EXISTS verification (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          identifier TEXT NOT NULL,
          value TEXT NOT NULL,
          "expiresAt" TIMESTAMPTZ NOT NULL,
          "createdAt" TIMESTAMPTZ DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // better-auth: organizations (replaces sg_organizations in Supabase)
      await client.query(`
        CREATE TABLE IF NOT EXISTS organization (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          name TEXT NOT NULL,
          slug TEXT UNIQUE,
          logo TEXT,
          metadata TEXT,
          status TEXT NOT NULL DEFAULT 'free',
          "createdAt" TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // better-auth: org members (replaces sg_user_organizations in Supabase)
      await client.query(`
        CREATE TABLE IF NOT EXISTS "member" (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
          "organizationId" TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'member',
          "createdAt" TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE("userId", "organizationId")
        )
      `);

      // better-auth: org invitations
      await client.query(`
        CREATE TABLE IF NOT EXISTS invitation (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "organizationId" TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member',
          status TEXT NOT NULL DEFAULT 'pending',
          "inviterId" TEXT NOT NULL REFERENCES "user"(id),
          "expiresAt" TIMESTAMPTZ NOT NULL,
          "createdAt" TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // better-auth: JWKS keys (required by JWT plugin)
      await client.query(`
        CREATE TABLE IF NOT EXISTS jwks (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "publicKey" TEXT NOT NULL,
          "privateKey" TEXT NOT NULL,
          "createdAt" TIMESTAMPTZ DEFAULT NOW(),
          "expiresAt" TIMESTAMPTZ,
          alg TEXT,
          crv TEXT
        )
      `);

      // Add multi_tenancy_mode column to integrations table
      await client.query(`
        ALTER TABLE integrations ADD COLUMN IF NOT EXISTS multi_tenancy_mode TEXT DEFAULT 'disabled'
      `);

      // Create indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sg_end_users_org_id ON sg_end_users(org_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sg_end_user_credentials_end_user_id ON sg_end_user_credentials(end_user_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sg_portal_tokens_expires_at ON sg_portal_tokens(expires_at)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sg_roles_org_id ON sg_roles(org_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sg_user_role_assignments_user_id ON sg_user_role_assignments(user_id, org_id)
      `);
      // better-auth indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_session_user_id ON "session"("userId")
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_session_token ON "session"(token)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_account_user_id ON "account"("userId")
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_member_user_id ON "member"("userId")
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_member_org_id ON "member"("organizationId")
      `);

      logMessage("debug", "EE tables initialized successfully");
    } catch (error) {
      logMessage("error", `Failed to initialize EE tables: ${error}`);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // End User Methods
  // ============================================

  async getEndUser(params: { id: string; orgId: string }): Promise<EndUser | null> {
    const { id, orgId } = params;
    const client = await this.pool.connect();
    try {
      // Get end user with credentials in a single query
      const result = await client.query(
        `SELECT 
           eu.id, eu.org_id, eu.external_id, eu.email, eu.name, 
           eu.metadata, eu.created_at, eu.updated_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'systemId', cred.system_id,
                 'systemName', cred.system_name,
                 'hasCredentials', cred.has_credentials,
                 'connectedAt', cred.connected_at
               )
             ) FILTER (WHERE cred.system_id IS NOT NULL),
             '[]'
           ) as credentials
         FROM sg_end_users eu
         LEFT JOIN LATERAL (
           SELECT 
             i.id as system_id,
             i.name as system_name,
             euc.id IS NOT NULL as has_credentials,
             euc.updated_at as connected_at
           FROM integrations i
           LEFT JOIN sg_end_user_credentials euc 
             ON i.id = euc.system_id 
             AND euc.end_user_id = eu.id 
             AND euc.org_id = $2
           WHERE i.org_id = $2 
             AND i.multi_tenancy_mode = 'enabled'
         ) cred ON true
         WHERE eu.id = $1 AND eu.org_id = $2
         GROUP BY eu.id`,
        [id, orgId],
      );

      if (result.rows.length === 0) return null;

      return {
        ...this.mapRowToEndUser(result.rows[0]),
        credentials: result.rows[0].credentials || [],
      };
    } finally {
      client.release();
    }
  }

  async getEndUserByExternalId(params: {
    externalId: string;
    orgId: string;
  }): Promise<EndUser | null> {
    const { externalId, orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, org_id, external_id, email, name, metadata, created_at, updated_at
         FROM sg_end_users
         WHERE external_id = $1 AND org_id = $2`,
        [externalId, orgId],
      );

      if (result.rows.length === 0) return null;

      return this.mapRowToEndUser(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async createEndUser(params: { endUser: EndUserInput; orgId: string }): Promise<EndUser> {
    const { endUser, orgId } = params;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO sg_end_users (org_id, external_id, email, name, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, org_id, external_id, email, name, metadata, created_at, updated_at`,
        [orgId, endUser.externalId, endUser.email, endUser.name, endUser.metadata || {}],
      );
      const endUserId = result.rows[0].id;
      await client.query(
        `INSERT INTO sg_user_role_assignments (end_user_id, role_id, org_id)
         VALUES ($1, 'enduser', $2)`,
        [endUserId, orgId],
      );
      await client.query("COMMIT");
      return this.mapRowToEndUser(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateEndUser(params: {
    id: string;
    endUser: Partial<EndUserInput>;
    orgId: string;
  }): Promise<EndUser | null> {
    const { id, endUser, orgId } = params;
    const client = await this.pool.connect();
    try {
      // Build dynamic update query based on provided fields
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (endUser.externalId !== undefined) {
        updates.push(`external_id = $${paramIndex++}`);
        values.push(endUser.externalId);
      }
      if (endUser.email !== undefined) {
        updates.push(`email = $${paramIndex++}`);
        values.push(endUser.email);
      }
      if (endUser.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(endUser.name);
      }
      if (endUser.metadata !== undefined) {
        updates.push(`metadata = $${paramIndex++}`);
        values.push(endUser.metadata);
      }

      if (updates.length === 0) {
        // No updates provided, just return the existing user
        return this.getEndUser({ id, orgId });
      }

      updates.push("updated_at = NOW()");
      values.push(id, orgId);

      const result = await client.query(
        `UPDATE sg_end_users SET ${updates.join(", ")}
         WHERE id = $${paramIndex++} AND org_id = $${paramIndex}
         RETURNING id, org_id, external_id, email, name, metadata, created_at, updated_at`,
        values,
      );

      if (result.rows.length === 0) return null;
      return this.mapRowToEndUser(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async listEndUsers(params: {
    orgId: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: EndUser[]; total: number }> {
    const { orgId, limit = 50, offset = 0 } = params;
    const client = await this.pool.connect();
    try {
      // Single query: get end users with aggregated credential status via LATERAL JOIN
      const [dataResult, countResult] = await Promise.all([
        client.query(
          `SELECT
             eu.id, eu.org_id, eu.external_id, eu.email, eu.name,
             eu.metadata, eu.created_at, eu.updated_at,
             COALESCE(
               json_agg(
                 json_build_object(
                   'systemId', cred.system_id,
                   'systemName', cred.system_name,
                   'hasCredentials', cred.has_credentials,
                   'connectedAt', cred.connected_at
                 )
               ) FILTER (WHERE cred.system_id IS NOT NULL),
               '[]'
             ) as credentials
           FROM sg_end_users eu
           LEFT JOIN LATERAL (
             SELECT
               i.id as system_id,
               i.name as system_name,
               euc.id IS NOT NULL as has_credentials,
               euc.updated_at as connected_at
             FROM integrations i
             LEFT JOIN sg_end_user_credentials euc
               ON i.id = euc.system_id
               AND euc.end_user_id = eu.id
               AND euc.org_id = $1
             WHERE i.org_id = $1
               AND i.multi_tenancy_mode = 'enabled'
           ) cred ON true
           WHERE eu.org_id = $1
           GROUP BY eu.id
           ORDER BY eu.created_at DESC
           LIMIT $2 OFFSET $3`,
          [orgId, limit, offset],
        ),
        client.query(`SELECT COUNT(*) as total FROM sg_end_users WHERE org_id = $1`, [orgId]),
      ]);

      return {
        items: dataResult.rows.map((row: any) => ({
          ...this.mapRowToEndUser(row),
          credentials: row.credentials || [],
        })),
        total: parseInt(countResult.rows[0].total, 10),
      };
    } finally {
      client.release();
    }
  }

  async deleteEndUser(params: { id: string; orgId: string }): Promise<boolean> {
    const { id, orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(`DELETE FROM sg_end_users WHERE id = $1 AND org_id = $2`, [
        id,
        orgId,
      ]);
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  // ============================================
  // End User Credential Methods
  // ============================================

  async getEndUserCredentials(params: {
    endUserId: string;
    systemId: string;
    orgId: string;
  }): Promise<Record<string, any> | null> {
    const { endUserId, systemId, orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT credentials FROM sg_end_user_credentials
         WHERE end_user_id = $1 AND system_id = $2 AND org_id = $3`,
        [endUserId, systemId, orgId],
      );

      if (result.rows.length === 0) return null;

      // Decrypt credentials using the same encryption as system credentials
      return credentialEncryption.decrypt(result.rows[0].credentials);
    } finally {
      client.release();
    }
  }

  async upsertEndUserCredentials(params: {
    endUserId: string;
    systemId: string;
    orgId: string;
    credentials: Record<string, any>;
  }): Promise<void> {
    const { endUserId, systemId, orgId, credentials } = params;
    const client = await this.pool.connect();
    try {
      // Encrypt credentials using the same encryption as system credentials
      const encryptedCredentials = credentialEncryption.encrypt(credentials);

      await client.query(
        `INSERT INTO sg_end_user_credentials (end_user_id, system_id, org_id, credentials)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (end_user_id, system_id) DO UPDATE SET
           credentials = EXCLUDED.credentials,
           updated_at = NOW()`,
        [endUserId, systemId, orgId, encryptedCredentials],
      );
    } finally {
      client.release();
    }
  }

  async deleteEndUserCredentials(params: {
    endUserId: string;
    systemId: string;
    orgId: string;
  }): Promise<boolean> {
    const { endUserId, systemId, orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM sg_end_user_credentials
         WHERE end_user_id = $1 AND system_id = $2 AND org_id = $3`,
        [endUserId, systemId, orgId],
      );
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  // ============================================
  // Portal Token Methods
  // ============================================

  async createPortalToken(params: {
    endUserId: string;
    orgId: string;
    ttlSeconds?: number;
  }): Promise<PortalToken> {
    const { endUserId, orgId, ttlSeconds = 3600 } = params; // Default 1 hour
    const client = await this.pool.connect();
    try {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      await client.query(
        `INSERT INTO sg_portal_tokens (token, end_user_id, org_id, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [token, endUserId, orgId, expiresAt],
      );

      return { token, expiresAt };
    } finally {
      client.release();
    }
  }

  async validatePortalToken(params: {
    token: string;
  }): Promise<{ endUserId: string; orgId: string } | null> {
    const { token } = params;
    const client = await this.pool.connect();
    try {
      // Validate the token (don't consume - allow reuse during session)
      const result = await client.query(
        `SELECT end_user_id, org_id
         FROM sg_portal_tokens
         WHERE token = $1 
           AND expires_at > NOW()`,
        [token],
      );

      if (result.rows.length === 0) return null;

      return {
        endUserId: result.rows[0].end_user_id,
        orgId: result.rows[0].org_id,
      };
    } finally {
      client.release();
    }
  }

  async cleanupExpiredTokens(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`DELETE FROM sg_portal_tokens WHERE expires_at < NOW()`);
      const count = result.rowCount ?? 0;
      if (count > 0) {
        logMessage("info", `Cleaned up ${count} expired portal tokens`);
      }
      return count;
    } finally {
      client.release();
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  // ============================================
  // Role Methods
  // ============================================

  async getRole(params: { id: string; orgId: string }): Promise<Role | null> {
    const { id, orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT r.*, COUNT(ura.id) as user_count
         FROM sg_roles r
         LEFT JOIN sg_user_role_assignments ura ON r.id = ura.role_id AND ura.org_id = r.org_id
         WHERE r.id = $1 AND r.org_id = $2
         GROUP BY r.id, r.org_id`,
        [id, orgId],
      );
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToRole(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async listRoles(params: {
    orgId: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: Role[]; total: number }> {
    const { orgId, limit = 50, offset = 0 } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT r.*, COUNT(ura.id) as user_count
         FROM sg_roles r
         LEFT JOIN sg_user_role_assignments ura ON r.id = ura.role_id AND ura.org_id = r.org_id
         WHERE r.org_id = $1
         GROUP BY r.id, r.org_id
         ORDER BY r.created_at ASC`,
        [orgId],
      );

      const roles = result.rows.map((row: any) => this.mapRowToRole(row));
      const predefined = roles.filter((r) => isPredefinedRole(r.id));
      const custom = roles.filter((r) => !isPredefinedRole(r.id));
      const allRoles = [...predefined, ...custom];
      const total = allRoles.length;
      const paginatedRoles = allRoles.slice(offset, offset + limit);

      return { items: paginatedRoles, total };
    } finally {
      client.release();
    }
  }

  async createRole(params: {
    role: RoleInput;
    orgId: string;
    id?: string;
    isBaseRole?: boolean;
  }): Promise<Role> {
    const { role, orgId, id, isBaseRole } = params;
    const client = await this.pool.connect();
    try {
      const roleId = id || `role-${Date.now()}`;
      const roleData = {
        tools: role.tools ?? [],
        systems: role.systems ?? {},
      };
      const result = await client.query(
        `INSERT INTO sg_roles (id, org_id, name, description, access_rules, is_base_role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          roleId,
          orgId,
          role.name,
          role.description || null,
          JSON.stringify(roleData),
          isBaseRole === true,
        ],
      );
      return this.mapRowToRole(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async updateRole(params: {
    id: string;
    role: Partial<RoleInput>;
    orgId: string;
  }): Promise<Role | null> {
    const { id, role, orgId } = params;

    const client = await this.pool.connect();
    try {
      const sets: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      if (role.name !== undefined) {
        sets.push(`name = $${paramIdx++}`);
        values.push(role.name);
      }
      if (role.description !== undefined) {
        sets.push(`description = $${paramIdx++}`);
        values.push(role.description);
      }
      if (role.tools !== undefined || role.systems !== undefined) {
        const existingRole = await this.getRole({ id, orgId });
        const merged = {
          tools: role.tools ?? existingRole?.tools ?? "ALL",
          systems: role.systems ?? existingRole?.systems ?? {},
        };
        sets.push(`access_rules = $${paramIdx++}`);
        values.push(JSON.stringify(merged));
      }

      if (sets.length === 0) return this.getRole({ id, orgId });

      sets.push(`updated_at = NOW()`);
      values.push(id, orgId);

      const result = await client.query(
        `UPDATE sg_roles SET ${sets.join(", ")} WHERE id = $${paramIdx++} AND org_id = $${paramIdx}
         RETURNING *`,
        values,
      );

      if (result.rows.length === 0) return null;
      return this.mapRowToRole(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async deleteRole(params: { id: string; orgId: string }): Promise<boolean> {
    const { id, orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM sg_roles WHERE id = $1 AND org_id = $2 AND is_base_role = FALSE`,
        [id, orgId],
      );
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  async appendToolToRole(params: { roleId: string; toolId: string; orgId: string }): Promise<void> {
    const { roleId, toolId, orgId } = params;
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE sg_roles
         SET access_rules = jsonb_set(
           access_rules,
           '{tools}',
           CASE
             WHEN access_rules->'tools' @> to_jsonb($1::text) THEN access_rules->'tools'
             ELSE (access_rules->'tools') || to_jsonb($1::text)
           END
         ),
         updated_at = NOW()
         WHERE id = $2 AND org_id = $3
           AND access_rules->'tools' != '"ALL"'::jsonb`,
        [toolId, roleId, orgId],
      );
    } finally {
      client.release();
    }
  }

  async removeToolFromRoles(params: { toolId: string; orgId: string }): Promise<void> {
    const { toolId, orgId } = params;
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE sg_roles
         SET access_rules = jsonb_set(
           access_rules,
           '{tools}',
           (SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
            FROM jsonb_array_elements(access_rules->'tools') AS elem
            WHERE elem != to_jsonb($1::text))
         ),
         updated_at = NOW()
         WHERE org_id = $2
           AND access_rules->'tools' != '"ALL"'::jsonb
           AND access_rules->'tools' @> to_jsonb($1::text)`,
        [toolId, orgId],
      );
    } finally {
      client.release();
    }
  }

  async renameToolInRoles(params: {
    oldToolId: string;
    newToolId: string;
    orgId: string;
  }): Promise<void> {
    const { oldToolId, newToolId, orgId } = params;
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE sg_roles
         SET access_rules = jsonb_set(
           access_rules,
           '{tools}',
           (SELECT jsonb_agg(
             CASE WHEN elem = to_jsonb($1::text) THEN to_jsonb($2::text) ELSE elem END
           ) FROM jsonb_array_elements(access_rules->'tools') AS elem)
         ),
         updated_at = NOW()
         WHERE org_id = $3
           AND access_rules->'tools' != '"ALL"'::jsonb
           AND access_rules->'tools' @> to_jsonb($1::text)`,
        [oldToolId, newToolId, orgId],
      );
    } finally {
      client.release();
    }
  }

  async appendSystemToRole(params: {
    roleId: string;
    systemId: string;
    accessLevel: string;
    orgId: string;
  }): Promise<void> {
    const { roleId, systemId, accessLevel, orgId } = params;
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE sg_roles
         SET access_rules = jsonb_set(
           access_rules,
           '{systems}',
           access_rules->'systems' || jsonb_build_object($1::text, $2::text)
         ),
         updated_at = NOW()
         WHERE id = $3 AND org_id = $4
           AND access_rules->'systems' != '"ALL"'::jsonb`,
        [systemId, accessLevel, roleId, orgId],
      );
    } finally {
      client.release();
    }
  }

  async removeSystemFromRoles(params: { systemId: string; orgId: string }): Promise<void> {
    const { systemId, orgId } = params;
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE sg_roles
         SET access_rules = access_rules #- ARRAY['systems', $1::text],
         updated_at = NOW()
         WHERE org_id = $2
           AND access_rules->'systems' != '"ALL"'::jsonb
           AND access_rules->'systems' ? $1`,
        [systemId, orgId],
      );
    } finally {
      client.release();
    }
  }

  async getRolesForUser(params: { userId: string; orgId: string }): Promise<Role[]> {
    const { userId, orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT DISTINCT r.*
         FROM sg_roles r
         WHERE r.org_id = $2
           AND r.id IN (
             SELECT ura.role_id FROM sg_user_role_assignments ura
             WHERE ura.user_id = $1 AND ura.org_id = $2
           )`,
        [userId, orgId],
      );
      const roles = result.rows.map((row: any) => this.mapRowToRole(row));
      return roles;
    } finally {
      client.release();
    }
  }

  async getAuthUser(params: {
    userId: string;
  }): Promise<{ id: string; email: string | null; name: string | null } | null> {
    const { userId } = params;
    if (!userId) throw new Error("could not get user information for missing user id");

    const client = await this.pool.connect();
    try {
      const result = await client.query(`SELECT id, email, name FROM "user" WHERE id = $1`, [
        userId,
      ]);
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      return { id: row.id, email: row.email ?? null, name: row.name ?? null };
    } finally {
      client.release();
    }
  }

  // Batch fetch user profiles from better-auth's global "user" table.
  // Callers must pre-filter userIds to the current org (e.g. via listOrgMembers/listRoleAssignments).
  async getAuthUsersByIds(params: {
    userIds: string[];
  }): Promise<{ id: string; email: string | null; name: string | null }[]> {
    const { userIds } = params;
    if (userIds.length === 0) return [];

    const client = await this.pool.connect();
    try {
      const result = await client.query(`SELECT id, email, name FROM "user" WHERE id = ANY($1)`, [
        userIds,
      ]);
      return result.rows.map((row: any) => ({
        id: row.id,
        email: row.email ?? null,
        name: row.name ?? null,
      }));
    } finally {
      client.release();
    }
  }

  async getOrgMembership(params: {
    userId: string;
    orgId: string;
  }): Promise<{ role: string } | null> {
    const { userId, orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT role FROM "member" WHERE "userId" = $1 AND "organizationId" = $2`,
        [userId, orgId],
      );
      return result.rows.length > 0 ? { role: result.rows[0].role } : null;
    } finally {
      client.release();
    }
  }

  async listOrgMembers(params: { orgId: string }): Promise<{ userId: string; role: string }[]> {
    const { orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT "userId", role FROM "member" WHERE "organizationId" = $1`,
        [orgId],
      );
      return result.rows.map((row: any) => ({ userId: row.userId, role: row.role }));
    } finally {
      client.release();
    }
  }

  async listApiKeysByUserId(params: {
    orgId: string;
    userId: string;
  }): Promise<import("../types.js").ApiKeyRecord[]> {
    const { orgId, userId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, org_id, key, user_id, created_by_user_id, is_active, created_at, updated_at
         FROM api_keys WHERE org_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
        [orgId, userId],
      );
      return result.rows.map((row: any) => this.mapApiKeyRow(row));
    } finally {
      client.release();
    }
  }

  async listPendingInvitations(params: { orgId: string }): Promise<OrgInvitation[]> {
    const { orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, email, role, status, "inviterId", "expiresAt", "createdAt"
         FROM invitation
         WHERE "organizationId" = $1 AND status = 'pending'
         ORDER BY "createdAt" DESC`,
        [orgId],
      );
      return result.rows.map((row: any) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.status,
        inviterId: row.inviterId,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      }));
    } finally {
      client.release();
    }
  }

  async addUserRoles(params: { userId: string; roleIds: string[]; orgId: string }): Promise<void> {
    const { userId, roleIds, orgId } = params;
    if (roleIds.length === 0) return;
    const isEndUser = await this.isEndUser(userId, orgId);
    const column = isEndUser ? "end_user_id" : "member_user_id";
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const roleId of roleIds) {
        await client.query(
          `INSERT INTO sg_user_role_assignments (${column}, role_id, org_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [userId, roleId, orgId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async removeUserRole(params: { userId: string; roleId: string; orgId: string }): Promise<void> {
    const { userId, roleId, orgId } = params;
    const client = await this.pool.connect();
    try {
      await client.query(
        `DELETE FROM sg_user_role_assignments WHERE user_id = $1 AND role_id = $2 AND org_id = $3`,
        [userId, roleId, orgId],
      );
    } finally {
      client.release();
    }
  }

  async deleteAllUserRoles(params: { userId: string; orgId: string }): Promise<void> {
    const { userId, orgId } = params;
    const client = await this.pool.connect();
    try {
      await client.query(
        `DELETE FROM sg_user_role_assignments WHERE user_id = $1 AND org_id = $2`,
        [userId, orgId],
      );
    } finally {
      client.release();
    }
  }

  private async isEndUser(userId: string, orgId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT 1 FROM sg_end_users WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [userId, orgId],
      );
      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  async listRoleAssignments(params: { orgId: string }): Promise<Record<string, string[]>> {
    const { orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT user_id, role_id FROM sg_user_role_assignments WHERE org_id = $1`,
        [orgId],
      );
      const assignments: Record<string, string[]> = {};
      for (const row of result.rows) {
        if (!assignments[row.user_id]) {
          assignments[row.user_id] = [];
        }
        assignments[row.user_id].push(row.role_id);
      }
      return assignments;
    } finally {
      client.release();
    }
  }

  private mapRowToRole(row: any): Role {
    const stored =
      typeof row.access_rules === "string" ? JSON.parse(row.access_rules) : row.access_rules || {};
    const isNewModel =
      stored &&
      typeof stored === "object" &&
      !Array.isArray(stored) &&
      ("tools" in stored || "systems" in stored);

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tools: isNewModel ? (stored.tools ?? []) : [],
      systems: isNewModel ? (stored.systems ?? {}) : {},
      isBaseRole: Boolean(row.is_base_role),
      userCount: parseInt(row.user_count || "0", 10),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToEndUser(row: any): EndUser {
    return {
      id: row.id,
      orgId: row.org_id,
      externalId: row.external_id,
      email: row.email,
      name: row.name,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
