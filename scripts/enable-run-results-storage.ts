#!/usr/bin/env node
/**
 * Enable run results storage for an organization.
 *
 * This script sets the `storeRunResults` preference for an org, which causes
 * completed runs to be stored in S3 (gzipped JSON).
 *
 * Prerequisites:
 *   - AWS_BUCKET_NAME must be set in .env for storage to actually work
 *   - Postgres connection configured in .env
 *
 * Usage:
 *   npx tsx scripts/enable-run-results-storage.ts <orgId> [--disable]
 *
 * Examples:
 *   npx tsx scripts/enable-run-results-storage.ts my-org-id
 *   npx tsx scripts/enable-run-results-storage.ts my-org-id --disable
 *
 * Environment variables (from .env):
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USERNAME, POSTGRES_PASSWORD
 *   AWS_BUCKET_NAME (required for storage to work at runtime)
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: npx tsx scripts/enable-run-results-storage.ts <orgId> [--disable]

Enable or disable run results storage (S3) for an organization.

Arguments:
  orgId       The organization ID to configure
  --disable   Disable storage instead of enabling it

Environment variables (from .env):
  POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USERNAME, POSTGRES_PASSWORD
  AWS_BUCKET_NAME (required for storage to work at runtime)

Examples:
  npx tsx scripts/enable-run-results-storage.ts my-org-id
  npx tsx scripts/enable-run-results-storage.ts my-org-id --disable
`);
    process.exit(0);
  }

  const orgId = args.find((arg) => !arg.startsWith("--"));
  const disable = args.includes("--disable");

  if (!orgId) {
    console.error("Error: orgId is required");
    process.exit(1);
  }

  // Check AWS_BUCKET_NAME
  if (!process.env.AWS_BUCKET_NAME && !disable) {
    console.warn(
      "⚠️  Warning: AWS_BUCKET_NAME is not set. Storage will be enabled in the database,",
    );
    console.warn("   but runs won't actually be stored until AWS_BUCKET_NAME is configured.\n");
  }

  const host = process.env.POSTGRES_HOST || "localhost";
  const port = parseInt(process.env.POSTGRES_PORT || "5432");
  const database = process.env.POSTGRES_DB || "superglue";
  const user = process.env.POSTGRES_USERNAME || "postgres";
  const password = process.env.POSTGRES_PASSWORD || "postgres";

  console.log(`Connecting to Postgres: ${host}:${port}/${database}`);

  const pool = new Pool({
    host,
    port,
    database,
    user,
    password,
    max: 1,
    ssl:
      host.includes("localhost") || host.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    // Get current settings
    const existingResult = await client.query(
      "SELECT preferences FROM org_settings WHERE org_id = $1",
      [orgId],
    );

    const existing = existingResult.rows[0];
    const currentPrefs = existing?.preferences || {};
    const currentValue = currentPrefs.storeRunResults ?? false;

    console.log(`\nOrg: ${orgId}`);
    console.log(`Current storeRunResults: ${currentValue}`);
    console.log(`New storeRunResults: ${!disable}`);

    if (currentValue === !disable) {
      console.log(`\n✓ No change needed - storeRunResults is already ${!disable}`);
      return;
    }

    // Update settings
    const newPrefs = { ...currentPrefs, storeRunResults: !disable };

    await client.query(
      `INSERT INTO org_settings (org_id, notifications, preferences, created_at, updated_at)
       VALUES ($1, NULL, $2, NOW(), NOW())
       ON CONFLICT (org_id) DO UPDATE SET
         preferences = $2,
         updated_at = NOW()`,
      [orgId, JSON.stringify(newPrefs)],
    );

    console.log(
      `\n✓ Successfully ${disable ? "disabled" : "enabled"} run results storage for org: ${orgId}`,
    );

    if (!disable && process.env.AWS_BUCKET_NAME) {
      console.log(`  Storage bucket: ${process.env.AWS_BUCKET_NAME}`);
      console.log(`  Results path: s3://${process.env.AWS_BUCKET_NAME}/${orgId}/run-results/`);
    }
  } catch (error: any) {
    console.error(`\n✗ Failed to update org settings: ${error.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
