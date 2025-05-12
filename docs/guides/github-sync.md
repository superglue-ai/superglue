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
    *   Make sure the `scripts/upsert-superglue-workflows.js` file exists and contains the synchronization logic.
    *   Make sure the `.github/workflows/superglue-sync.yml` file exists and defines the GitHub Actions workflow.

## How it Works

*   **Trigger:** The workflow runs automatically:
    *   Every day at 03:00 UTC.
    *   Whenever changes are pushed to the `main` branch specifically within the `superglue/workflows/` directory.
*   **Steps:**
    1.  Checks out the repository code.
    2.  Sets up Node.js (version 20).
    3.  Installs the `@superglue/client` package.
    4.  Executes the `scripts/upsert-superglue-workflows.js` script.
*   **Script Logic (`upsert-superglue-workflows.js`):**
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
  sync_to_superglue:
    # This job runs on push events to the workflows directory
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install @superglue/client

      - name: Sync Workflows TO Superglue
        run: node scripts/upsert-superglue-workflows.js
        env:
          SUPERGLUE_API_KEY: ${{ secrets.SUPERGLUE_API_KEY }}
          # SUPERGLUE_API_ENDPOINT: ${{ secrets.SUPERGLUE_API_ENDPOINT }} # Optional

  sync_from_superglue:
    # This job runs on the scheduled trigger
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    permissions:
        contents: write # Needed to push changes back to the repo
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install @superglue/client

      - name: Sync Workflows FROM Superglue
        run: node scripts/fetch-superglue-workflows.js # This is the new script
        env:
          SUPERGLUE_API_KEY: ${{ secrets.SUPERGLUE_API_KEY }}
          # SUPERGLUE_API_ENDPOINT: ${{ secrets.SUPERGLUE_API_ENDPOINT }} # Optional

      - name: Configure Git
        run: |
          git config --global user.name 'github-actions[bot]'
          git config --global user.email 'github-actions[bot]@users.noreply.github.com'

      - name: Commit and push changes
        run: |
          git add superglue/workflows/*.json
          # Check if there are changes to commit
          if git diff --staged --quiet; then
            echo "No changes to commit."
          else
            git commit -m "chore: Sync workflows from Superglue service"
            git push
          fi

## scripts/upsert-superglue-workflows.js
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

## scripts/fetch-superglue-workflows.js
```
const fs = require('fs');
const path = require('path');
const { SuperglueClient } = require('@superglue/client');
const { execSync } = require('child_process'); // Needed for git commands later

const WORKFLOWS_DIR = path.join(__dirname, '..', 'superglue', 'workflows'); // Assumes workflows are in <repo_root>/superglue/workflows/
const API_KEY = process.env.SUPERGLUE_API_KEY;
const API_ENDPOINT = process.env.SUPERGLUE_API_ENDPOINT; // Optional: defaults to https://graphql.superglue.cloud

if (!API_KEY) {
  console.error('Error: SUPERGLUE_API_KEY environment variable is not set.');
  process.exit(1);
}

// Ensure the workflows directory exists
if (!fs.existsSync(WORKFLOWS_DIR)) {
  console.log(`Creating workflows directory: ${WORKFLOWS_DIR}`);
  fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
}

const client = new SuperglueClient({ apiKey: API_KEY, endpoint: API_ENDPOINT });

async function fetchAndWriteWorkflows() {
  console.log(`Fetching all workflows from Superglue...`);
  let allWorkflows = [];
  let offset = 0;
  const limit = 50; // Adjust limit as needed, API might have its own max

  try {
    while (true) {
      console.log(`Fetching workflows with offset ${offset}...`);
      const batch = await client.listWorkflows(limit, offset);
      if (!batch || batch.length === 0) {
        break; // No more workflows
      }
      allWorkflows = allWorkflows.concat(batch);
      if (batch.length < limit) {
        break; // Last page
      }
      offset += limit;
    }
  } catch (error) {
    console.error('Error fetching workflows:', error.message || error);
    process.exit(1);
  }

  console.log(`Fetched ${allWorkflows.length} workflows in total.`);

  // --- Strategy: Clear directory and write all fetched workflows ---
  console.log(`Clearing existing files in ${WORKFLOWS_DIR}...`);
  const existingFiles = fs.readdirSync(WORKFLOWS_DIR);
  for (const file of existingFiles) {
    if (file.endsWith('.json')) {
      fs.unlinkSync(path.join(WORKFLOWS_DIR, file));
      console.log(`  Deleted ${file}`);
    }
  }

  console.log(`Writing fetched workflows to ${WORKFLOWS_DIR}...`);
  let writeCount = 0;
  for (const workflow of allWorkflows) {
    if (!workflow || !workflow.id) {
      console.warn('  Skipping workflow with missing ID:', workflow);
      continue;
    }
    const workflowId = workflow.id;
    const filePath = path.join(WORKFLOWS_DIR, `${workflowId}.json`);
    // Remove read-only fields before saving
    const { version, createdAt, updatedAt, ...workflowData } = workflow;
    try {
      // Pretty print JSON
      fs.writeFileSync(filePath, JSON.stringify(workflowData, null, 2), 'utf-8');
      console.log(`  Wrote ${workflowId}.json`);
      writeCount++;
    } catch (error) {
      console.error(`  Error writing file ${filePath}:`, error.message || error);
    }
  }

  console.log(`\nFinished writing ${writeCount} workflow files.`);
  // The committing and pushing is handled by the GitHub Action workflow steps
}

fetchAndWriteWorkflows();
```
## Monitoring

You can monitor the execution of the workflow in the **Actions** tab of your GitHub repository. Check the logs for successful synchronization messages or any potential errors.