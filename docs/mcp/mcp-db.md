---
description: "A quick guide on using superglue MCP to build database integrations."
title: "Reliable database access"
---

In this guide, we will cover how to use superglue MCP to build custom database query tools in Cursor. Working with databases often involves complex multi-table joins, aggregations, and data transformations. Superglue MCP can automate these processes, enabling the creation of sophisticated database queries through natural language prompts.

This guide demonstrates how to build and run a tool that:

1. Connects to a PostgreSQL database containing LEGO dataset
2. Executes complex queries across multiple tables
3. Returns structured data for analysis and reporting

You can use the superglue client SDK to do this, but in this tutorial we will cover how to build this tool using superglue MCP.

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

## Building a Custom Database Query Tool

You can find detailed descriptions of all available tools provided by superglue MCP [here](/docs/mcp/mcp-tools). In this tutorial, we will build a custom database integration tool using natural language through your Cursor chat interface.

Here's how to create a tool that analyzes LEGO data:

### Example Prompts:

```
Find the most popular LEGO themes by number of sets
Get detailed information about parts and colors for specific sets
Calculate inventory statistics across different themes

Always tell superglue your database connection: postgres://superglue:superglue@database-1.c01e6ms2cdvl.us-east-1.rds.amazonaws.com:5432/lego
```

<video autoPlay muted loop playsInline className="w-full aspect-video" src="https://superglue.cloud/files/mcp-db.mp4" />

### What Happened Under the Hood:

- superglue MCP used `superglue_build_new_tool` to create a new database workflow that connects to PostgreSQL and executes the requested queries
- superglue MCP used `superglue_execute_tool` to run the workflow and fetch the actual LEGO data
- superglue MCP used `superglue_get_integration_code` to generate code for embedding this database workflow in your application

## Example: Creating a New Custom LEGO Set

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

Let's say you want to add a new custom LEGO set to the database. Instead of building a persistent tool, you can run a one-time instruction:

```
Execute this instruction once: Create a new LEGO set in my database with the following details and add it to the inventory:
- Set number: "CUSTOM-001"
- Name: "My Custom Castle"
- Year: 2024
- Theme: Castle
- Number of parts: 150

Database connection: postgres://postgres:password@localhost:5432/lego
```

This will execute immediately and return the results without creating a saved tool. Perfect for:
- Data entry tasks
- One-time data migrations
- Quick database updates
- Testing database operations

## Next Steps

- **Reuse Tools**: Execute your database tools anytime using `superglue_execute_tool` with the tool ID, or programmatically using the generated integration code
- **Complex Analytics**: Build tools for advanced analytics, data mining, or reporting across multiple database tables
- **Multi-Database**: Create tools that join data across different databases or combine database queries with API calls
- **Real-time Queries**: Set up tools for live database monitoring and alerting