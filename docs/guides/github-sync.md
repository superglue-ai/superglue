# Superglue Workflow Synchronization with GitHub Actions

This document describes how to set up and use the GitHub Actions workflow to automatically synchronize Superglue workflow definitions stored in this repository with the Superglue service.

The synchronization treats the workflow definitions in the `superglue/workflows/` directory as the source of truth. Any changes pushed to these files (on the `main` branch) or the daily schedule will trigger the action to update the corresponding workflows in Superglue using the `upsertWorkflow` operation.

## Setup

1.  **Store Workflow Definitions:**
    *   Create a directory named `superglue/workflows/` in the root of your repository.
    *   Place your Superglue workflow definitions inside this directory as individual JSON files.
    *   **Important:** The name of each file (without the `.json` extension) will be used as the `id` for the workflow when calling `upsertWorkflow`. For example, a file named `superglue/workflows/my-cool-workflow.json` will upsert a workflow with the ID `my-cool-workflow`. The `id` field *within* the JSON file itself is not used by the `upsertWorkflow` mutation's logic but should ideally match the filename for clarity.

2.  **Add Superglue API Key as a Secret:**
    *   Go to your GitHub repository's **Settings** > **Secrets and variables** > **Actions**.
    *   Click **New repository secret**.
    *   Create a secret named `SUPERGLUE_API_KEY`.
    *   Paste your Superglue API key into the **Value** field.
    *   Click **Add secret**.
    *   (Optional) If you use a custom Superglue endpoint (not `https://graphql.superglue.cloud`), create another secret named `SUPERGLUE_API_ENDPOINT` with your custom endpoint URL.

3.  **Ensure Script and Workflow Files Exist:**
    *   Make sure the `scripts/sync-superglue-workflows.js` file exists and contains the synchronization logic.
    *   Make sure the `.github/workflows/superglue-sync.yml` file exists and defines the GitHub Actions workflow.

## How it Works

*   **Trigger:** The workflow runs automatically:
    *   Every day at 03:00 UTC.
    *   Whenever changes are pushed to the `main` branch specifically within the `superglue/workflows/` directory.
*   **Steps:**
    1.  Checks out the repository code.
    2.  Sets up Node.js (version 20).
    3.  Installs the `@superglue/client` package.
    4.  Executes the `scripts/sync-superglue-workflows.js` script.
*   **Script Logic (`sync-superglue-workflows.js`):**
    1.  Reads the `SUPERGLUE_API_KEY` (and optionally `SUPERGLUE_API_ENDPOINT`) from environment variables (provided by GitHub Actions secrets).
    2.  Initializes the `SuperglueClient`.
    3.  Reads all `.json` files from the `superglue/workflows/` directory.
    4.  For each file:
        *   Parses the JSON content.
        *   Extracts the workflow ID from the filename.
        *   Calls `client.upsertWorkflow(workflowId, workflowData)` to create or update the workflow in Superglue.
    5.  Logs progress and any errors to the GitHub Actions console.

## .github/workflows/superglue-sync.yml
```
name: Sync Superglue Workflows

on:
  schedule:
    # Runs 'at 03:00 UTC every day' https://crontab.guru/#0_3_*_*_*
    - cron: '0 3 * * *'
  push:
    branches:
      - main # Or your default branch
    paths:
      - 'superglue/workflows/**.json' # Trigger only if workflow definitions change

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20' # Use a current LTS version

      - name: Install dependencies
        run: npm install @superglue/client
        # If you have a package.json, you might prefer:
        # run: npm ci

      - name: Sync Workflows with Superglue
        run: node scripts/sync-superglue-workflows.js
        env:
          SUPERGLUE_API_KEY: ${{ secrets.SUPERGLUE_API_KEY }}
          # SUPERGLUE_API_ENDPOINT: ${{ secrets.SUPERGLUE_API_ENDPOINT }} # Optional: Add if you use a custom endpoint
```

## scripts/sync-superglue-workflows.js
```
const fs = require('fs');
const path = require('path');
const { SuperglueClient } = require('@superglue/client');

const WORKFLOWS_DIR = path.join(__dirname, '..', 'superglue', 'workflows'); // Assumes workflows are in <repo_root>/superglue/workflows/
const API_KEY = process.env.SUPERGLUE_API_KEY;
const API_ENDPOINT = process.env.SUPERGLUE_API_ENDPOINT; // Optional: defaults to https://graphql.superglue.cloud

if (!API_KEY) {
  console.error('Error: SUPERGLUE_API_KEY environment variable is not set.');
  process.exit(1);
}

const client = new SuperglueClient({ apiKey: API_KEY, endpoint: API_ENDPOINT });

async function syncWorkflows() {
  console.log(`Reading workflow definitions from: ${WORKFLOWS_DIR}`);

  if (!fs.existsSync(WORKFLOWS_DIR)) {
    console.warn(`Warning: Workflows directory not found: ${WORKFLOWS_DIR}. Skipping sync.`);
    return;
  }

  const files = fs.readdirSync(WORKFLOWS_DIR);
  const workflowFiles = files.filter(file => file.endsWith('.json'));

  if (workflowFiles.length === 0) {
    console.log('No workflow definition files (.json) found. Nothing to sync.');
    return;
  }

  console.log(`Found ${workflowFiles.length} workflow definitions to sync.`);

  for (const file of workflowFiles) {
    const filePath = path.join(WORKFLOWS_DIR, file);
    const workflowId = path.basename(file, '.json'); // Use filename as ID

    try {
      console.log(`\nSyncing workflow: ${workflowId} from ${file}...`);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const workflowData = JSON.parse(fileContent);

      // Ensure the ID in the data matches the filename, or add it if missing
      if (workflowData.id && workflowData.id !== workflowId) {
         console.warn(`  Warning: Workflow ID in ${file} ("${workflowData.id}") does not match filename ("${workflowId}"). Using filename as ID for upsert.`);
      }
      // The upsert mutation in the client uses the first argument `id`,
      // the `id` field within the `input` (second argument) is ignored by the backend.
      // So we don't strictly need workflowData.id = workflowId;

      const result = await client.upsertWorkflow(workflowId, workflowData);
      console.log(`  Successfully upserted workflow: ${result.id} (Version: ${result.version})`);

    } catch (error) {
      console.error(`  Error syncing workflow ${workflowId} from ${file}:`, error.message || error);
      // Decide if one error should stop the whole process
      // process.exit(1); // Optional: uncomment to exit on first error
    }
  }

  console.log('\nWorkflow synchronization complete.');
}

syncWorkflows();
```
## Monitoring

You can monitor the execution of the workflow in the **Actions** tab of your GitHub repository. Check the logs for successful synchronization messages or any potential errors.