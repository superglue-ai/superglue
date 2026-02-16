import type {
  EndUser,
  EndUserInput,
  EndUserCredentialStatus,
  PortalToken,
} from "@superglue/shared";
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
    this.initializeEETables();
  }

  /**
   * Initialize EE-specific tables for multi-tenancy support.
   * Uses CREATE TABLE IF NOT EXISTS for idempotent initialization.
   */
  private async initializeEETables(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // End users table with allowed_systems for scoping
      await client.query(`
        CREATE TABLE IF NOT EXISTS sg_end_users (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          org_id TEXT NOT NULL,
          external_id TEXT NOT NULL,
          email TEXT,
          name TEXT,
          allowed_systems TEXT[] DEFAULT ARRAY[]::TEXT[],
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(org_id, external_id)
        )
      `);

      // Backwards-compatible: add allowed_systems column if it doesn't exist
      await client.query(`
        ALTER TABLE sg_end_users ADD COLUMN IF NOT EXISTS allowed_systems TEXT[] DEFAULT ARRAY[]::TEXT[]
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
      const result = await client.query(
        `SELECT id, org_id, external_id, email, name, allowed_systems, metadata, created_at, updated_at
         FROM sg_end_users
         WHERE id = $1 AND org_id = $2`,
        [id, orgId],
      );

      if (result.rows.length === 0) return null;

      return this.mapRowToEndUser(result.rows[0]);
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
        `SELECT id, org_id, external_id, email, name, allowed_systems, metadata, created_at, updated_at
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
      // Default to [] (no access) if not specified - caller must explicitly pass ['*'] for full access
      const allowedSystems = endUser.allowedSystems ?? [];

      const result = await client.query(
        `INSERT INTO sg_end_users (org_id, external_id, email, name, allowed_systems, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, org_id, external_id, email, name, allowed_systems, metadata, created_at, updated_at`,
        [
          orgId,
          endUser.externalId,
          endUser.email,
          endUser.name,
          allowedSystems,
          endUser.metadata || {},
        ],
      );

      return this.mapRowToEndUser(result.rows[0]);
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
      if (endUser.allowedSystems !== undefined) {
        updates.push(`allowed_systems = $${paramIndex++}`);
        values.push(endUser.allowedSystems);
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
         RETURNING id, org_id, external_id, email, name, allowed_systems, metadata, created_at, updated_at`,
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
      const [dataResult, countResult] = await Promise.all([
        client.query(
          `SELECT id, org_id, external_id, email, name, allowed_systems, metadata, created_at, updated_at
           FROM sg_end_users
           WHERE org_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [orgId, limit, offset],
        ),
        client.query(`SELECT COUNT(*) as total FROM sg_end_users WHERE org_id = $1`, [orgId]),
      ]);

      return {
        items: dataResult.rows.map((row: any) => this.mapRowToEndUser(row)),
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

  async listEndUserCredentials(params: {
    endUserId: string;
    orgId: string;
  }): Promise<EndUserCredentialStatus[]> {
    const { endUserId, orgId } = params;
    const client = await this.pool.connect();
    try {
      // Join with integrations to get system names and check which systems have multi-tenancy enabled
      const result = await client.query(
        `SELECT 
           i.id as system_id,
           i.name as system_name,
           i.multi_tenancy_mode,
           euc.id IS NOT NULL as has_credentials,
           euc.updated_at as connected_at
         FROM integrations i
         LEFT JOIN sg_end_user_credentials euc 
           ON i.id = euc.system_id 
           AND euc.end_user_id = $1 
           AND euc.org_id = $2
         WHERE i.org_id = $2 
           AND i.multi_tenancy_mode = 'enabled'
         ORDER BY i.name`,
        [endUserId, orgId],
      );

      return result.rows.map((row: any) => ({
        systemId: row.system_id,
        systemName: row.system_name,
        hasCredentials: row.has_credentials,
        connectedAt: row.connected_at,
      }));
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

  /**
   * Get the allowed systems for an end user.
   * Returns null if the user is not found.
   * Returns ['*'] if the user has access to all systems.
   * Returns specific system IDs if the user has restricted access.
   * Returns [] if the user has no access.
   */
  async getEndUserAllowedSystems(params: {
    endUserId: string;
    orgId: string;
  }): Promise<string[] | null> {
    const { endUserId, orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT allowed_systems FROM sg_end_users WHERE id = $1 AND org_id = $2`,
        [endUserId, orgId],
      );

      if (result.rows.length === 0) return null;

      // Return the actual allowed_systems array (could be ['*'], [], or specific IDs)
      // Default to [] (no access) if null/undefined in DB for security
      return result.rows[0].allowed_systems ?? [];
    } finally {
      client.release();
    }
  }

  private mapRowToEndUser(row: any): EndUser {
    return {
      id: row.id,
      orgId: row.org_id,
      externalId: row.external_id,
      email: row.email,
      name: row.name,
      allowedSystems: row.allowed_systems,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
