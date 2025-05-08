---
title: 'JIRA'
description: 'How to extract projects and tasks'
---

When building applications that integrate with JIRA, you often need to:
- Extract project and task data in a specific format
- Handle nested relationships (projects and tasks)
- Transform JIRA's specific fields into your schema
- Deal with pagination and authentication

Let's see how superglue makes this straightforward.

> **Note:** All config objects support the full [ApiConfig](/api-reference/types) schema: `urlHost`, `urlPath`, `documentationUrl`, `instruction`, `responseSchema`, `method`, `headers`, `queryParams`, `body`, `authentication`, `pagination`, `dataPath`, etc. Most fields are inferred if omitted. See the API Reference for all config fields and enum values (`AuthType`, `PaginationType`, etc).

## Prerequisites

- A JIRA account with access to the JIRA API
- Early access to the hosted version of superglue via https://superglue.cloud or a [self-hosted server](self-hosting)

## Authentication Setup

1. Generate a JIRA API token from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Note your JIRA domain (e.g., `superglue.atlassian.net`)
3. Keep both the token and domain handy for the examples below

## Installation

```bash
npm install @superglue/client
npm install zod zod-to-json-schema

# get early access to our hosted version via https://superglue.cloud or [self-host](self-hosting).
```

## Authentication

JIRA requires authentication, which we can handle via API tokens.

You can generate an API token from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens).

From with this token and your email address, you can generate a base64 encoded JIRA token.

```bash
echo -n "your-email:your-token" | base64
```

## Simple Project and Task Extraction

Let's start with a basic example that fetches projects and tasks (called issues in JIRA) from a single project:

```typescript
import { SuperglueClient } from "@superglue/client";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const superglue = new SuperglueClient({
  apiKey: "your-api-key",
  endpoint: "if you are using a self-hosted server, e.g. http://localhost:3000",
});

// Create a basic schema for projects
const projectListSchema = z.object({
  projects: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
      description: z.string(),
      target_date: z.string().optional(),
      start_date: z.string().optional(),
    })
  )
});

// Create a basic schema for tasks
// The schema should include a project_id field so that we can assign each task to a project
const taskListSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      project_id: z.string(),
      identifier: z.string().describe("JIRA issue key (e.g., PRJ-123)"),
      title: z.string(),
      description: z.string(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
      status: z.string(),
      assignee: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        email: z.string().optional(),
        avatar_url: z.string().optional()
      }).optional(),
      created_at: z.string(),
      updated_at: z.string(),
      due_date: z.string().optional()
    })
  )
});

// Full config objects (all fields optional except urlHost, instruction, responseSchema)
const projectConfig = {
  urlHost: "https://superglue.atlassian.net",
  documentationUrl: "https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json?_v=1.7687.0-0.1317.0",
  instruction: "Extract all project names and their basic information.",
  responseSchema: zodToJsonSchema(projectListSchema),
  // method: "GET", // optional, inferred
  // headers: {}, // optional, inferred
  // queryParams: {}, // optional, inferred
  // body: undefined, // optional, inferred
  // authentication: "HEADER", // AuthType, optional, inferred
  // pagination: { type: "OFFSET_BASED", pageSize: "50" }, // PaginationType, optional, inferred
};

const taskConfig = {
  urlHost: "https://superglue.atlassian.net",
  documentationUrl: "https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json?_v=1.7687.0-0.1317.0",
  instruction: "Extract all issues and their detailed information from the issues endpoint.",
  responseSchema: zodToJsonSchema(taskListSchema),
  // method, headers, queryParams, authentication, pagination, dataPath as above
};

async function main() {
  try {
    // Fetch projects
    const projectResult = await superglue.call({
      endpoint: projectConfig,
      credentials: {
        basic_token: jiraToken
      }
    });

    // Fetch tasks
    const taskResult = await superglue.call({
      endpoint: taskConfig,
      credentials: {
        basic_token: jiraToken
      }
    });

    // Combine projects and tasks using the project_id field
    const projects = projectResult.data.projects.map(p => ({
      ...p,
      tasks: taskResult.data.tasks.filter(t => t.project_id === p.id)
    }));
    
    console.log(JSON.stringify(projects, null, 2));

  } catch (error) {
    console.error("Failed to fetch data:", error);
  }
}

main();
```

The generated task jsonata will look similar to this:

```jsonata
{
   "projects": [
    $.{
      "id": id,
      "title": name,
      "url": self,
      "description": description ? description : "",
      "target_date": null,
      "start_date": null
    }
  ]
  "tasks": [
    $.{
      "id": id,
      "identifier": key,
      "title": fields.summary,
      "description": fields.description.content[0].content[0].text ? fields.description.content[0].content[0].text : "No description available",
      "priority": $uppercase(fields.priority.name) = "MEDIUM" ? "MEDIUM" : $uppercase(fields.priority.name) = "HIGH" ? "HIGH" : $uppercase(fields.priority.name) = "LOW" ? "LOW" : $uppercase(fields.priority.name) = "HIGHEST" ? "URGENT" : $uppercase(fields.priority.name) = "LOWEST" ? "LOW" : "URGENT",
      "status": fields.status.name,
      "assignee": fields.assignee ? {
        "id": fields.assignee.accountId,
        "name": fields.assignee.displayName,
        "email": fields.assignee.emailAddress,
        "avatar_url": $string(fields.assignee.avatarUrls["48x48"])
      } : null,
      "created_at": fields.created,
      "updated_at": fields.updated,
      "due_date": fields.duedate
    }
  ]
}
```

Notice that superglue automatically parses field priorities to handle priorities not found in your schema. Particularly, it converts "Highest" to "URGENT" and "Lowest" to "LOW". Also, it cannot find corresponding fields for target_date and start_date, so it returns null for those fields. This is valid since these fields are not required by our schema.

### What's Happening Here?

1. **Schema Definition**: We define a schema that includes:
   - Project details (id, title, dates)
   - Task information (id, status, priority)
   - Assignee details
   - Timestamps and metadata

2. **Configuration**: The config object tells superglue:
   - Where to get the data (JIRA REST API endpoint)
   - What to extract (via the instruction)
   - How to format it (via responseSchema)
   - How to handle authentication and pagination

3. **Joining Projects and Tasks**: Since we have formatted the tasks with the project identifier, we can easily join the projects and tasks together, creating a list of projects with their tasks.

### Understanding the Response

The transformed data will look like this:

```json
{
  "projects": [
    {
      "id": "10000",
      "title": "Mobile App Development",
      "url": "https://your-domain.atlassian.net/projects/MOB",
      "description": "Mobile application development project",
      "target_date": "2024-12-31",
      "tasks": [
        {
          "id": "10001",
          "identifier": "MOB-123",
          "title": "Implement User Authentication",
          "description": "Add OAuth2 authentication flow",
          "priority": "HIGH",
          "status": "IN_PROGRESS",
          "assignee": {
            "id": "user123",
            "name": "Jane Doe",
            "email": "jane@example.com",
            "avatar_url": "https://..."
          },
          "created_at": "2024-01-15T10:00:00Z",
          "updated_at": "2024-01-16T15:30:00Z",
          "due_date": "2024-02-01T00:00:00Z"
        }
      ]
    }
  ]
}
```

## Next Steps

- Check the [API Reference](../api-reference/types.md) for detailed type information and all config fields
- Learn about [authentication options](../api-reference/types.md#authtype)
- Join our [Discord](https://discord.gg/SKRYYQEp) for support
