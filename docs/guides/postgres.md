---
title: 'PostgreSQL Integration'
description: 'Learn how to connect and query PostgreSQL databases in Superglue workflows'
---

# PostgreSQL Integration

Superglue provides native support for PostgreSQL databases, allowing you to execute SQL queries directly within your workflows without setting up a separate integration.

## Connection Format

PostgreSQL connections are automatically detected when the URL starts with `postgres://` or `postgresql://`.

### Basic Connection Structure

```json
{
  "urlHost": "postgres://username:password@hostname:port",
  "urlPath": "database_name",
  "body": {
    "query": "SELECT * FROM users",
    "params": []
  }
}
```

## Authentication

PostgreSQL credentials can be provided in multiple ways:

### 1. Connection String
Include credentials directly in the URL:
```
postgres://myuser:mypassword@localhost:5432
```

### 2. Using Variables
Use Superglue variables for secure credential management:
```
postgres://<<integrationId_dbUser>>:<<integrationId_dbPassword>>@<<integrationId_dbHost>>:<<integrationId_dbPort>>
```

### 3. SSL/TLS Configuration
The connection automatically uses SSL with `rejectUnauthorized: false` for flexibility. For production environments with valid certificates, this can be configured accordingly.

## Query Execution

### Simple Queries

Basic query without parameters:
```json
{
  "body": {
    "query": "SELECT name, email FROM users WHERE active = true"
  }
}
```

### Parameterized Queries (Recommended)

Parameterized queries prevent SQL injection and improve performance:

```json
{
  "body": {
    "query": "SELECT * FROM users WHERE age > $1 AND status = $2",
    "params": [21, "active"]
  }
}
```

### Dynamic Parameters with Variables

Use Superglue variables and expressions in parameters:
```json
{
  "body": {
    "query": "SELECT * FROM orders WHERE created_at > $1 AND user_id = $2",
    "params": [
      "<<start_date>>",
      "<<(sourceData) => sourceData.userId>>"
    ]
  }
}
```

### Insert Operations

Insert data with returning clause:
```json
{
  "body": {
    "query": "INSERT INTO products (name, price, category) VALUES ($1, $2, $3) RETURNING *",
    "values": ["Widget", 29.99, "Electronics"]
  }
}
```

Note: Both `params` and `values` keys are supported for compatibility.

## Workflow Examples

### Example 1: Simple Data Retrieval

```javascript
// Step configuration
{
  "id": "getUserData",
  "urlHost": "postgres://<<integrationId_dbUser>>:<<integrationId_dbPassword>>@<<integrationId_dbHost>>:<<integrationId_dbPort>>",
  "urlPath": "myapp_db",
  "body": {
    "query": "SELECT id, name, email FROM users WHERE created_at > $1",
    "params": ["2024-01-01"]
  },
  "instruction": "Fetch all users created after January 1st, 2024"
}
```

### Example 2: Multi-Step Query with Dependencies

```javascript
// Step 1: Get categories
{
  "id": "getCategories",
  "urlHost": "postgres://<<integrationId_dbUser>>:<<integrationId_dbPassword>>@<<integrationId_dbHost>>:<<integrationId_dbPort>>",
  "urlPath": "<<integrationId_dbName>>",
  "body": {
    "query": "SELECT DISTINCT category FROM products WHERE active = true"
  },
  "instruction": "Get all active product categories"
}

// Step 2: Get products by category
{
  "id": "getProductsByCategory",
  "urlHost": "postgres://<<integrationId_dbUser>>:<<integrationId_dbPassword>>@<<integrationId_dbHost>>:<<integrationId_dbPort>>",
  "urlPath": "<<integrationId_dbName>>",
  "body": {
    "query": "SELECT * FROM products WHERE category = ANY($1::text[])",
    "params": ["<<(sourceData) => sourceData.getCategories.map(c => c.category)>>"]
  },
  "instruction": "Get all products in the previously fetched categories"
}
```

### Example 3: Batch Insert with Loop

```javascript
// Loop configuration
{
  "id": "insertRecords",
  "executionMode": "LOOP",
  "loopSelector": "(sourceData) => sourceData.newRecords",
  "urlHost": "postgres://<<integrationId_dbUser>>:<<integrationId_dbPassword>>@<<integrationId_dbHost>>:<<integrationId_dbPort>>",
  "urlPath": "<<integrationId_dbName>>",
  "body": {
    "query": "INSERT INTO events (user_id, event_type, metadata) VALUES ($1, $2, $3) RETURNING id",
    "params": [
      "<<currentItem.userId>>",
      "<<currentItem.eventType>>",
      "<<(sourceData, currentItem) => JSON.stringify(currentItem.metadata)>>"
    ]
  },
  "instruction": "Insert each event record into the database"
}
```

## Common Patterns

### 1. Exploratory Queries
When you need to understand the database structure:
```json
{
  "body": {
    "query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1",
    "params": ["users"]
  }
}
```

### 2. Transactions (Single Statement)
PostgreSQL executes each query in its own transaction by default:
```json
{
  "body": {
    "query": "UPDATE inventory SET quantity = quantity - $1 WHERE product_id = $2 AND quantity >= $1 RETURNING *",
    "params": [5, "PROD-123"]
  }
}
```

### 3. JSON Operations
Working with JSONB columns:
```json
{
  "body": {
    "query": "SELECT * FROM users WHERE metadata @> $1::jsonb",
    "params": ["{\"role\": \"admin\"}"]
  }
}
```

### 4. Date Filtering
```json
{
  "body": {
    "query": "SELECT * FROM logs WHERE created_at BETWEEN $1 AND $2",
    "params": [
      "<<(sourceData) => new Date(Date.now() - 7*24*60*60*1000).toISOString()>>",
      "<<(sourceData) => new Date().toISOString()>>"
    ]
  }
}
```

## Error Handling

The PostgreSQL integration includes automatic retry logic and comprehensive error reporting:

- **Connection errors**: Check your connection string and network accessibility
- **Authentication errors**: Verify credentials and database permissions
- **Query errors**: Review SQL syntax and table/column names
- **Timeout errors**: Default timeout is 30 seconds, configurable via options

### Common Issues

1. **Database name sanitization**: Special characters in database names are automatically cleaned
2. **SSL connections**: SSL is enabled by default with flexible certificate validation
3. **Parameter mismatches**: Ensure the number of `$n` placeholders matches the params array length

## Performance Considerations

1. **Use parameterized queries**: Better performance and security than string concatenation
2. **Limit result sets**: Add `LIMIT` clauses to prevent overwhelming data transfers
3. **Index optimization**: Ensure proper indexes exist for frequently queried columns
4. **Connection pooling**: Each query creates a new connection pool that's closed after execution

## Security Best Practices

1. **Never hardcode credentials**: Use Superglue's variable system for sensitive data
2. **Always use parameterized queries**: Prevents SQL injection attacks
3. **Principle of least privilege**: Use database users with minimal required permissions
4. **Validate input data**: Sanitize data before using in queries, even with parameters
5. **Use read-only users**: For data retrieval workflows, use accounts without write permissions

## Response Format

PostgreSQL queries return an array of row objects:

```json
[
  {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  },
  {
    "id": 2,
    "name": "Jane Smith",
    "email": "jane@example.com"
  }
]
```

Empty result sets return an empty array `[]`.

## Integration with Other Steps

PostgreSQL results can be easily used in subsequent workflow steps:

```javascript
// Access results in next step
"<<(sourceData) => sourceData.getUserData.map(u => u.email).join(',')>>"

// Filter results
"<<(sourceData) => sourceData.getProducts.filter(p => p.price > 100)>>"

// Aggregate data
"<<(sourceData) => sourceData.getSales.reduce((sum, s) => sum + s.amount, 0)>>"
```