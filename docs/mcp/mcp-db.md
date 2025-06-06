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

- Docker installed on your machine
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

## Setting Up the LEGO Database

First, let's set up a PostgreSQL database with LEGO data using Docker:

### 1. Start PostgreSQL Container

```bash
docker run --name lego-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=lego -p 5432:5432 -d postgres:15
```

### 2. Download and Load the LEGO Dataset

```bash
# Download the dataset
wget https://raw.githubusercontent.com/neondatabase/postgres-sample-dbs/main/lego.sql

# Load the data into the database
psql -d "postgres://postgres:password@localhost:5432/lego" -f lego.sql
```

### 3. Verify the Setup

Connect to the database and run a test query:

```bash
psql postgres://postgres:password@localhost:5432/lego
```

```sql
-- Find the top 5 LEGO themes by the number of sets
SELECT lt.name AS theme_name, COUNT(ls.set_num) AS number_of_sets
FROM lego_themes lt
JOIN lego_sets ls ON lt.id = ls.theme_id
GROUP BY lt.name
ORDER BY number_of_sets DESC
LIMIT 5;
```

## Building a Custom Database Query Tool

You can find detailed descriptions of all available tools provided by superglue MCP [here](/docs/mcp/mcp-tools). In this tutorial, we will build a custom database integration tool using natural language through your Cursor chat interface.

Here's how to create a tool that analyzes LEGO data:

### Example Prompt:

```
Build a tool that connects to my PostgreSQL database and analyzes LEGO data. I want to:

1. Find the most popular LEGO themes by number of sets
2. Get detailed information about parts and colors for specific sets
3. Calculate inventory statistics across different themes

Database connection: postgres://postgres:password@localhost:5432/lego

The database has these main tables:
- lego_sets (set_num, name, year, theme_id, num_parts)
- lego_themes (id, name, parent_id)
- lego_parts (part_num, name, part_cat_id)
- lego_colors (id, name, rgb, is_trans)
- inventories (id, version, set_num)
- inventory_parts (inventory_id, part_num, color_id, quantity, is_spare)

I want the results to include theme names, set counts, and part statistics.
```

<video autoPlay muted loop playsInline className="w-full aspect-video" src="https://superglue.cloud/files/mcp-doc-demo.mp4" />

### What Happened Under the Hood:

- superglue MCP used `superglue_build_new_tool` to create a new database workflow that connects to PostgreSQL and executes the requested queries
- superglue MCP used `superglue_execute_tool` to run the workflow and fetch the actual LEGO data
- superglue MCP used `superglue_get_integration_code` to generate code for embedding this database workflow in your application

## Example: Creating a New Custom LEGO Set

Let's say you want to add a new custom LEGO set to the database. Instead of building a persistent tool, you can run a one-time instruction:

```
Execute this instruction once: Create a new LEGO set in my database with the following details:
- Set number: "CUSTOM-001"
- Name: "My Custom Castle"
- Year: 2024
- Theme: Castle (theme_id: 186)
- Number of parts: 150

Also add it to the inventories table with version 1.

Database connection: postgres://postgres:password@localhost:5432/lego

Use these SQL operations:
1. INSERT into lego_sets table
2. INSERT into inventories table
3. Return confirmation with the new set details
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