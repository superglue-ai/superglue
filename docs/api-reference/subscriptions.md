---
title: 'Subscriptions'
description: 'GraphQL subscriptions for real-time updates.'
---

## logs

Stream log messages in real time.

### Subscription
```graphql
subscription {
  logs {
    id
    message
    level
    timestamp
    runId
  }
}
```

### Fields
- `id`: ID!
- `message`: String!
- `level`: LogLevel (DEBUG, INFO, WARN, ERROR)
- `timestamp`: DateTime!
- `runId`: ID (optional)

### Example
```graphql
subscription {
  logs {
    id
    message
    level
    timestamp
    runId
  }
}
```

### LogLevel enum
- DEBUG
- INFO
- WARN
- ERROR 