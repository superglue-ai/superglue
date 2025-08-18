-- Migration: PostgreSQL Integration Schema Refactoring
-- From JSONB blob storage to individual columns + separate details table
-- Version: 001
-- Date: 2025-07-31

BEGIN;

-- Check if migration is needed (old schema has 'data' column)
DO $$
BEGIN
    -- Only proceed if old schema exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'integrations' 
        AND column_name = 'data'
        AND table_schema = current_schema()
    ) THEN
        
        RAISE NOTICE 'Starting integration schema migration...';
        
        -- Add new columns to integrations table
        ALTER TABLE integrations ADD COLUMN IF NOT EXISTS name VARCHAR(255);
        ALTER TABLE integrations ADD COLUMN IF NOT EXISTS type VARCHAR(100);
        ALTER TABLE integrations ADD COLUMN IF NOT EXISTS url_host VARCHAR(500);
        ALTER TABLE integrations ADD COLUMN IF NOT EXISTS url_path VARCHAR(500);
        ALTER TABLE integrations ADD COLUMN IF NOT EXISTS credentials JSONB;
        ALTER TABLE integrations ADD COLUMN IF NOT EXISTS documentation_url VARCHAR(1000);
        ALTER TABLE integrations ADD COLUMN IF NOT EXISTS documentation_pending BOOLEAN DEFAULT FALSE;
        ALTER TABLE integrations ADD COLUMN IF NOT EXISTS open_api_url VARCHAR(1000);
        ALTER TABLE integrations ADD COLUMN IF NOT EXISTS specific_instructions TEXT;
        ALTER TABLE integrations ADD COLUMN IF NOT EXISTS icon VARCHAR(255);
        ALTER TABLE integrations ADD COLUMN IF NOT EXISTS version VARCHAR(50);
        
        -- Create integration_details table for large fields
        CREATE TABLE IF NOT EXISTS integration_details (
            integration_id VARCHAR(255) NOT NULL,
            org_id VARCHAR(255),
            documentation TEXT,
            open_api_schema TEXT,
            PRIMARY KEY (integration_id, org_id),
            FOREIGN KEY (integration_id, org_id) REFERENCES integrations(id, org_id) ON DELETE CASCADE
        );
        
        -- Migrate data from JSONB to individual columns
        UPDATE integrations SET 
            name = data->>'name',
            type = data->>'type',
            url_host = data->>'urlHost',
            url_path = data->>'urlPath',
            credentials = CASE 
                WHEN data->>'credentials' IS NOT NULL 
                THEN (data->'credentials')::jsonb 
                ELSE NULL 
            END,
            documentation_url = data->>'documentationUrl',
            documentation_pending = COALESCE((data->>'documentationPending')::boolean, FALSE),
            open_api_url = data->>'openApiUrl',
            specific_instructions = data->>'specificInstructions',
            icon = data->>'icon',
            version = data->>'version'
        WHERE data IS NOT NULL;
        
        -- Migrate large fields to integration_details table
        INSERT INTO integration_details (integration_id, org_id, documentation, open_api_schema)
        SELECT 
            id, 
            org_id, 
            NULLIF(data->>'documentation', ''),
            NULLIF(data->>'openApiSchema', '')
        FROM integrations 
        WHERE data IS NOT NULL 
        AND (
            (data->>'documentation' IS NOT NULL AND data->>'documentation' != '') 
            OR (data->>'openApiSchema' IS NOT NULL AND data->>'openApiSchema' != '')
        );
        
        -- Create indexes for performance
        CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type, org_id);
        CREATE INDEX IF NOT EXISTS idx_integrations_url_host ON integrations(url_host);
        CREATE INDEX IF NOT EXISTS idx_integration_details_integration_id ON integration_details(integration_id, org_id);
        
        -- Drop the old data column
        ALTER TABLE integrations DROP COLUMN data;
        
        RAISE NOTICE 'Integration schema migration completed successfully';
        
    ELSE
        RAISE NOTICE 'Integration schema migration not needed - new schema already in place';
    END IF;
END
$$;

COMMIT; 