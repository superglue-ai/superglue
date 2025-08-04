---
title: "HubSpot Integration with Workflows"
description: "Fetch companies and their associated contacts from HubSpot using superglue Workflows."
---

Integrating with HubSpot often involves fetching related data, like companies and their contacts, and transforming it into a specific structure for your application. superglue Workflows can automate these multi-step processes, making it easier to manage complex data aggregation tasks.

This guide demonstrates how to build and execute a superglue Workflow to:

1. Fetch a list of companies from HubSpot.
2. For each company, fetch its associated contacts.
3. Combine this data into a nested structure where each company object contains an array of its contacts.

> **Note:** All config objects for individual workflow steps support the full [ApiConfig](/api-reference/types) schema. superglue infers most fields, but you can provide explicit configurations if needed. Workflows themselves are defined and then executed.

## Prerequisites

- A HubSpot account with API access.
- A HubSpot Private App and its Access Token (recommended for authentication).
- superglue SDK installed and configured (see [Quick Start](/introduction#quick-start)).

## Installation

Ensure you have the superglue client and Zod for schema definition:

```bash
npm install @superglue/client zod zod-to-json-schema
```

## Authentication

HubSpot's API uses Bearer token authentication. The simplest way is to create a [Private App](https://developers.hubspot.com/docs/api/private-apps) in your HubSpot developer account and use its Access Token.

Keep this token handy; you'll provide it as a credential when executing the workflow.

## Define Output Schemas with Zod

We'll define the structure for individual contacts and companies, and then a final schema for the combined data.

```typescript
import { SuperglueClient } from "@superglue/client";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Schema for a HubSpot Contact (simplified)
const contactSchema = z.object({
  id: z.string(),
  email: z.string().optional(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  phone: z.string().optional(),
  jobtitle: z.string().optional()
});

// Schema for a HubSpot Company, including its contacts
const companyWithContactsSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  domain: z.string().optional(),
  industry: z.string().optional(),
  city: z.string().optional(),
  contacts: z.array(contactSchema).optional().describe("Associated contacts for this company")
});

// Final schema for the list of companies with their contacts
const hubspotDataSchema = z.object({
  companies: z.array(companyWithContactsSchema)
});

const superglue = new SuperglueClient({
  apiKey: "YOUR_SUPERGLUE_API_KEY", // Your superglue API key
  // endpoint: "http://localhost:3000" // if self-hosting superglue
});

const HUBSPOT_ACCESS_TOKEN = "YOUR_HUBSPOT_PRIVATE_APP_TOKEN";
```

## Building the Workflow

We'll use `client.buildWorkflow()` to instruct superglue to create the necessary steps. superglue will analyze the HubSpot API (using the provided documentation URL) and the instruction to figure out how to fetch companies, then contacts for each company, and combine them.

```typescript
async function buildHubspotWorkflow() {
  console.log("Building HubSpot Company-Contacts Workflow...");

  const integrations = [
    {
      integration: {
        id: "hubspot_crm",
        name: "HubSpot CRM",
        urlHost: "https://api.hubapi.com",
        // Providing a general documentation URL helps superglue understand the API structure.
        // Specific endpoints for companies and contacts will be inferred from the instruction.
        documentationUrl: "https://developers.hubspot.com/docs/api/crm/overview",
        // Credentials can be hinted here if they are static, or provided fully at execution time.
        credentials: { HUBSPOT_ACCESS_TOKEN } 
      }
    }
  ];

  const instruction = `
    1. Fetch all companies from HubSpot. For each company, include its ID, name, domain, industry, and city.
    2. For each company fetched, retrieve all its associated contacts. 
    3. For each contact, include its ID, email, first name, last name, phone number, and job title.
  `;
  
  const workflow = await superglue.buildWorkflow(
    instruction,
    {}, // Initial payload, not needed for this read-only workflow
    integrations,
    zodToJsonSchema(hubspotDataSchema) // The desired final output schema
  );

  console.log("Workflow built successfully:", workflow.id);
  console.log(JSON.stringify(workflow, null, 2));
  return workflow;
}
```

When `buildWorkflow` is called:

- superglue analyzes the `instruction` and the `integrations` (HubSpot API documentation).
- It designs a sequence of steps: one to fetch companies, and then a looping mechanism or subsequent steps to fetch contacts for each company using associations.
- It determines the necessary API endpoints (e.g., `/crm/v3/objects/companies`, `/crm/v3/objects/contacts`, and how to query associations).
- It generates transformations to fit the data into `hubspotDataSchema`.

The `workflow` object returned contains the definition of these steps, including the generated `ApiConfig` objects for each API call.

## Executing the Workflow

Once the workflow is built, you can execute it using `client.executeWorkflow()`. You'll provide the workflow definition (or its ID if previously saved/upserted) and the necessary runtime credentials.

```typescript
async function executeHubspotWorkflow(workflowToExecute) {
  console.log(`\nExecuting HubSpot Workflow: ${workflowToExecute.id}...`);

  try {
    const result = await superglue.executeWorkflow({
      workflow: workflowToExecute, // Can also use { id: "workflow-id" } if saved
      // Provide the HubSpot Access Token at runtime
      credentials: {
        hubspot_crm_HUBSPOT_ACCESS_TOKEN: HUBSPOT_ACCESS_TOKEN // Matches the integration ID provided during build
      },
      // options: { cacheMode: "DISABLED" } // Optional request options
    });

    if (result.success) {
      console.log("Workflow executed successfully!");
      console.log("Fetched Companies with Contacts:");
      console.log(JSON.stringify(result.data, null, 2));
      // Example: result.data.companies[0].contacts
    } else {
      console.error("Workflow execution failed:", result.error);
      if (result.stepResults) {
        result.stepResults.forEach(step => {
          if (!step.success) {
            console.error(`Step ${step.stepId} failed:`, step.error);
          }
        });
      }
    }
    return result.data;
  } catch (error) {
    console.error("Error executing workflow:", error);
    throw error;
  }
}

// Main function to run the process
async function main() {
  try {
    const builtWorkflow = await buildHubspotWorkflow();
    const result = await executeHubspotWorkflow(builtWorkflow);
  } catch (error) {
    console.error("HubSpot integration process failed.");
  }
}

main();
```

### Expected Output (Simplified)

The `result.data` from a successful execution would look something like this:

```json
{
  "companies": [
    {
      "id": "1234567890",
      "name": "Global Corp Inc.",
      "domain": "globalcorp.com",
      "industry": "Technology",
      "city": "New York",
      "contacts": [
        {
          "id": "0987654321",
          "email": "jane.doe@globalcorp.com",
          "firstname": "Jane",
          "lastname": "Doe",
          "phone": "555-1234",
          "jobtitle": "CEO"
        },
        {
          "id": "1122334455",
          "email": "john.smith@globalcorp.com",
          "firstname": "John",
          "lastname": "Smith",
          "phone": "555-5678",
          "jobtitle": "CTO"
        }
      ]
    }
  ]
}
```

## Additional Notes

- **Error Handling**: The workflow will automatically retry failed steps and provide detailed error information for debugging.
- **Pagination**: HubSpot APIs are automatically paginated by superglue when building workflows.
- **Rate Limiting**: superglue handles HubSpot's rate limits automatically.
- **Data Mapping**: The JSONata transformations are automatically generated and cached for performance.
- **Saving Workflows**: You can save the `builtWorkflow` definition using `client.upsertWorkflow(workflow.id, workflow)` for later execution by ID.

## Further Exploration

- **Multi-Integration Workflows**: Combine HubSpot data with other services, or integrate HubSpot data with other integrations in a single workflow.
- Explore the [API Reference for Workflows](/api-reference/mutations#executeworkflow) and [Types](/api-reference/types#workflow) for more details.

This guide illustrates the power of superglue Workflows for orchestrating complex integrations with APIs like HubSpot, automating data fetching, transformation, and aggregation with simple, natural language instructions.