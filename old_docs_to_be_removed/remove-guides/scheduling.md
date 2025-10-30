---
title: "Workflow Scheduling"
description: "Schedule workflows to run automatically on recurring intervals using cron expressions"
---

Workflow scheduling allows you to automate recurring workflows without manual intervention. Execute data pipelines, syncs, and reports on a schedule that matches your business needs.

## Quick Start

```typescript
import { SuperglueClient } from "@superglue/client";

const client = new SuperglueClient({ 
  apiKey: "your-api-key" 
});

// Schedule a workflow to run daily at 2 AM Eastern Time
const schedule = await client.upsertWorkflowSchedule({
  workflowId: "daily-customer-sync",
  cronExpression: "0 2 * * *",
  timezone: "America/New_York",
  enabled: true,
  payload: {
    syncMode: "incremental"
  },
  options: {
    selfHealing: "ENABLED"
  }
});

console.log(`Next run: ${schedule.nextRunAt}`);
```

## Understanding Cron Expressions

Superglue uses standard 5-field cron syntax:

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sunday=0)
│ │ │ │ │
* * * * *
```

### Common Patterns

<AccordionGroup>
  <Accordion title="Daily & Hourly" icon="calendar-day">
    ```
    0 2 * * *        # Every day at 2:00 AM
    0 * * * *        # Every hour (on the hour)
    */15 * * * *     # Every 15 minutes
    */30 * * * *     # Every 30 minutes
    ```
  </Accordion>

  <Accordion title="Weekly & Business Hours" icon="calendar-week">
    ```
    0 9 * * 1        # Every Monday at 9:00 AM
    0 9 * * 1-5      # Every weekday (Mon-Fri) at 9:00 AM
    0 9-17 * * 1-5   # Every hour from 9 AM to 5 PM, weekdays
    ```
  </Accordion>

  <Accordion title="Custom Intervals" icon="clock-rotate-left">
    ```
    */5 * * * *      # Every 5 minutes
    0 */2 * * *      # Every 2 hours
    0 0 1 * *        # First day of every month at midnight
    ```
  </Accordion>
</AccordionGroup>

<Tip>
  Use [crontab.guru](https://crontab.guru) to validate and understand cron expressions. Note that superglue uses **5-field** cron (no seconds).
</Tip>

## Timezone Handling

All schedules require a valid IANA timezone identifier. The scheduler:
- Calculates next run time in your specified timezone
- Stores all times in UTC internally
- Handles daylight saving time transitions automatically

### Common Timezones

```typescript
"UTC"                    // Coordinated Universal Time
"America/New_York"       // US Eastern Time
"America/Los_Angeles"    // US Pacific Time
"America/Chicago"        // US Central Time
"Europe/London"          // British Time
"Europe/Paris"           // Central European Time
"Asia/Tokyo"             // Japan Standard Time
"Australia/Sydney"       // Australian Eastern Time
```

<Warning>
  Always use IANA timezone identifiers (e.g., `America/New_York`), not abbreviations like `EST` or `PST`. Abbreviations are ambiguous and not supported.
</Warning>

## Creating and Managing Schedules

### Create a Schedule

```typescript
const schedule = await client.upsertWorkflowSchedule({
  workflowId: "data-pipeline-workflow",
  cronExpression: "0 2 * * *",
  timezone: "America/New_York",
  enabled: true,
  payload: {
    source: "production-db",
    destination: "analytics-warehouse"
  },
  options: {
    selfHealing: "ENABLED",
    retries: 3
  }
});

console.log(`Schedule created with ID: ${schedule.id}`);
console.log(`Next run: ${schedule.nextRunAt}`);
```

### List Workflow Schedules

```typescript
const schedules = await client.listWorkflowSchedules("workflow-id");

for (const schedule of schedules) {
  console.log(`Schedule ${schedule.id}:`);
  console.log(`  Cron: ${schedule.cronExpression}`);
  console.log(`  Timezone: ${schedule.timezone}`);
  console.log(`  Enabled: ${schedule.enabled}`);
  console.log(`  Next run: ${schedule.nextRunAt}`);
  console.log(`  Last run: ${schedule.lastRunAt || 'Never'}`);
}
```

### Update a Schedule

```typescript
// Change the cron expression
const updated = await client.upsertWorkflowSchedule({
  id: "existing-schedule-id",
  cronExpression: "0 3 * * *",  // Change to 3 AM
  timezone: "America/Chicago"    // Change timezone
});

// Disable a schedule temporarily
const disabled = await client.upsertWorkflowSchedule({
  id: "existing-schedule-id",
  enabled: false
});

// Re-enable a schedule
const enabled = await client.upsertWorkflowSchedule({
  id: "existing-schedule-id",
  enabled: true
});
```

### Delete a Schedule

```typescript
const success = await client.deleteWorkflowSchedule("schedule-id");

if (success) {
  console.log("Schedule deleted successfully");
}
```

## Passing Data to Scheduled Workflows

### Using Payload

Pass dynamic data to your workflow at execution time:

```typescript
await client.upsertWorkflowSchedule({
  workflowId: "customer-report-workflow",
  cronExpression: "0 9 * * 1",  // Every Monday at 9 AM
  timezone: "America/New_York",
  enabled: true,
  payload: {
    reportType: "weekly",
    recipients: ["team@company.com"],
    includeCharts: true,
    dateRange: "last_7_days"
  }
});
```

### Using Options

Control workflow execution behavior with advanced options. These can be configured both via SDK and in the web UI under "Advanced Options":

```typescript
await client.upsertWorkflowSchedule({
  workflowId: "heavy-etl-workflow",
  cronExpression: "0 1 * * *",
  timezone: "UTC",
  enabled: true,
  options: {
    selfHealing: "ENABLED",
    retries: 5,            // Retry up to 5 times
    retryDelay: 60000,     // Wait 1 minute between retries
    webhookUrl: "https://your-app.com/webhook/workflow-complete"
  }
});
```

#### Available Options

- **Self-Healing**: Automatically retry and fix API configuration errors
  - `DISABLED`: No automatic fixes
  - `ENABLED`: Fixes both API requests and data transforms
  - `TRANSFORM_ONLY`: Only fixes data transformation errors
  - `REQUEST_ONLY`: Only fixes API call errors

- **Retries**: Number of retry attempts for failed API calls (default: 1, max: 10)

- **Timeout**: Maximum time to wait for API responses in milliseconds (default: 60000ms / 1 minute)

- **Webhook URL**: Send execution results to a webhook endpoint after each scheduled run
  - Receives POST request with `{runId, success, data?, error?}`
  - Useful for monitoring, alerting, or chaining workflows

<Tip>
  In the web UI, these options are available by clicking "Advanced Options" when creating or editing a schedule.
</Tip>

## Common Scheduling Patterns

### Daily ETL Pipeline

```typescript
// Run every night at 2 AM
const etlSchedule = await client.upsertWorkflowSchedule({
  workflowId: "nightly-etl",
  cronExpression: "0 2 * * *",
  timezone: "America/New_York",
  enabled: true,
  payload: {
    extractionDate: "yesterday",
    batchSize: 10000
  },
  options: {
    selfHealing: "ENABLED"
  }
});
```

### Hourly Data Sync

```typescript
// Sync data every hour during business hours
const syncSchedule = await client.upsertWorkflowSchedule({
  workflowId: "crm-sync",
  cronExpression: "0 9-17 * * 1-5",
  timezone: "America/Los_Angeles",
  enabled: true,
  payload: {
    syncType: "incremental",
    systems: ["salesforce", "hubspot"]
  }
});
```

### Weekly Report Generation

```typescript
// Generate reports every Monday at 8 AM
const reportSchedule = await client.upsertWorkflowSchedule({
  workflowId: "weekly-analytics-report",
  cronExpression: "0 8 * * 1",
  timezone: "Europe/London",
  enabled: true,
  payload: {
    period: "last_week",
    format: "pdf",
    distribution: "email"
  }
});
```

## Self-Hosting Considerations

When self-hosting superglue, the scheduler is an optional component controlled by environment variables.

### Enable the Scheduler

Set the `START_SCHEDULER_SERVER` environment variable:

```bash
# In your .env file or environment
START_SCHEDULER_SERVER=true
```

### How It Works

- The scheduler runs as part of the superglue server process
- Polls for due schedules every **30 seconds**
- Schedules won't fire more precisely than the 30-second polling interval
- Uses your configured datastore (Postgres, Redis, File, or Memory)

### Single Worker Architecture

<Warning>
  **Important:** The scheduler uses a **single worker** design with no distributed locking. Running multiple scheduler instances will cause **duplicate executions**.
</Warning>

**Best Practices:**
- Run the scheduler on only **one** server instance
- If using multiple servers, enable `START_SCHEDULER_SERVER=true` on only one
- Use load balancers to route API traffic, but keep scheduler separate
- Consider running the scheduler on a dedicated instance for large deployments

## Limitations

<Warning>
  - **Poll Interval**: The scheduler checks for due schedules every 30 seconds (not configurable)
  - **No Seconds Field**: Cron expressions don't support seconds - minimum interval is 1 minute
  - **No Years Field**: Cron expressions don't support years - use standard 5-field format
  - **Single Worker**: Running multiple scheduler instances will cause duplicate executions
  - **Single Catch-Up**: Missed schedules run once on restart (no multiple executions if server was down for several intervals)
</Warning>

## Troubleshooting

### Schedule Not Executing

1. **Check if scheduler is enabled:** Verify `START_SCHEDULER_SERVER=true` in self-hosted deployments
2. **Verify schedule is enabled:** Use `listWorkflowSchedules` to check the `enabled` field
3. **Check `nextRunAt`:** Ensure the next run time is in the future
4. **Validate cron expression:** Use [crontab.guru](https://crontab.guru) to verify syntax
5. **Verify timezone:** Ensure you're using a valid IANA timezone identifier

### Duplicate Executions

- Check if multiple scheduler instances are running
- Ensure `START_SCHEDULER_SERVER=true` is set on only one server

### Wrong Execution Times

- Verify the timezone is correct for your location
- Remember: next run times are stored in UTC but calculated using your timezone
- Check for daylight saving time transitions

### Missed Schedules During Downtime

- When the server restarts, it immediately executes any schedules that were due during downtime
- Only one execution occurs per missed schedule (no multiple catch-ups if multiple intervals were missed)
- After execution, the next run is calculated from the current time

## GraphQL API Reference

For GraphQL usage instead of the SDK, see:
- [WorkflowSchedule Type](/api-reference/types#workflowschedule)
- [listWorkflowSchedules Query](/api-reference/queries#listworkflowschedules)
- [upsertWorkflowSchedule Mutation](/api-reference/mutations#upsertworkflowschedule)
- [deleteWorkflowSchedule Mutation](/api-reference/mutations#deleteworkflowschedule)

## Next Steps

<CardGroup cols={2}>
  <Card title="Data Pipelines" icon="pipe" href="/data-engineers/data-pipelines">
    Learn how to build robust data pipelines with scheduled workflows
  </Card>
  <Card title="Self-Hosting Guide" icon="server" href="/guides/self-hosting">
    Complete guide to deploying superglue with the scheduler enabled
  </Card>
  <Card title="API Reference" icon="code" href="/api-reference/overview">
    Explore the complete GraphQL API for scheduling
  </Card>
</CardGroup>

