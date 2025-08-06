---
description: "A quick guide on using superglue MCP to build database integrations."
title: "MCP Example: Database Query"
---

In this guide, we will cover how to use superglue MCP to build custom database query workflows in Cursor. Working with databases often involves complex multi-table joins, aggregations, and data transformations. superglue MCP can automate these processes, enabling the creation of sophisticated database queries through natural language prompts.

This guide demonstrates how to build and run a workflow that:

1. Connects to a PostgreSQL database containing LEGO dataset
2. Executes complex queries across multiple tables
3. Returns structured data for analysis and reporting

You can use the superglue client SDK to do this, but in this tutorial we will cover how to build this workflow using superglue MCP.

<Note>
  If you want to use this setup to query your Supabase DB: You may need to enable [IPv4 support](https://supabase.com/docs/guides/platform/ipv4-address) in your database settings. Other than that, Supabase works just like any other PostgreSQL database with superglue MCP. Get your Supabase connection string by clicking [Connect](https://supabase.com/dashboard/project/_?showConnect=true) on your Supabase dashboard.
</Note>

## Prerequisites

- Ensure that you have added superglue MCP to your `mcp.json`

```json mcp.json
{
	"mcpServers": {
	  "superglue": {
			"command": "npx",
			"args": [
				"mcp-remote",
				"https://mcp.superglue.ai",
				"--header",
				"Authorization:${AUTH_HEADER}"
			],
			"env": {
				"AUTH_HEADER": "Bearer YOUR_SUPERGLUE_API_KEY"
			}	
	    }
	}
}
```

<video autoPlay muted loop playsInline className="w-full aspect-video" src="https://superglue.cloud/files/mcp.mp4" />

<Note>
  Make sure to replace the API key placeholder with your own API key after copying.
</Note>

## Building a Custom Database Query Workflow

You can find detailed descriptions of all available tools provided by superglue MCP [here](/docs/mcp/mcp-tools). In this tutorial, we will build a custom database integration workflow using natural language through your Cursor chat interface.

Here's how to create a workflow that analyzes LEGO data:

### Example Prompts:

<video autoPlay muted loop playsInline className="w-full aspect-video" src="https://superglue.cloud/files/mcp-db.mp4" />

```
Find the most popular LEGO themes by number of sets
Get detailed information about parts and colors for specific sets
Calculate inventory statistics across different themes

Always tell superglue your database connection: postgres://superglue:superglue@database-1.c01e6ms2cdvl.us-east-1.rds.amazonaws.com:5432/lego
```

### What Happened Under the Hood:

- superglue MCP used `superglue_create_integration` to create a database integration with the provided connection string
- superglue MCP used `superglue_build_and_run` to build and execute a workflow based on your natural language request
- The workflow was created, executed, and returned results
- Optionally, the workflow can be saved using `superglue_save_workflow` for future reuse

## Example: Creating a Persistent Database Query Workflow

<Note>
  The database used in this example is readonly. If you want to create your own writable database for testing, you can set up a local PostgreSQL instance:

  ```bash
  # Start PostgreSQL Container
  docker run --name lego-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=lego -p 5432:5432 -d postgres:15

  # Download and load the dataset
  wget https://raw.githubusercontent.com/neondatabase/postgres-sample-dbs/main/lego.sql
  psql -d "postgres://postgres:password@localhost:5432/lego" -f lego.sql
  ```
</Note>

Let's say you want to create a reusable workflow for analyzing LEGO sets by theme:

```
Build a workflow that:
1. Takes a theme name as input
2. Returns all sets in that theme with their piece counts
3. Calculates the average piece count for the theme
4. Lists the top 5 largest sets in the theme

Database connection: postgres://postgres:password@localhost:5432/lego
```

After building and testing with `superglue_build_and_run`, you can save it for future use:
- The workflow will be saved with a descriptive ID
- You can execute it anytime using `superglue_execute_workflow` with different theme names
- Generate integration code using `superglue_get_workflow_integration_code`

## Next Steps

- **Reuse Workflows**: Execute your database workflows anytime using `superglue_execute_workflow` with the workflow ID, or programmatically using the generated integration code
- **Complex Analytics**: Build workflows for advanced analytics, data mining, or reporting across multiple database tables
- **Multi-Database**: Create workflows that join data across different databases or combine database queries with API calls
- **Real-time Queries**: Set up workflows for live database monitoring and alerting