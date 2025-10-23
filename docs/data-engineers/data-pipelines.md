---
title: "Data Pipeline Patterns & Best Practices"
description: "Build robust, scalable data pipelines using superglue's workflow orchestration patterns"
---

Data pipelines are the backbone of modern data-driven applications. superglue transforms how you build, deploy, and maintain these pipelines by using natural language to orchestrate complex multi-step workflows that can self-heal when source formats change.

## Core Pipeline Patterns

<CardGroup cols={2}>
  <Card title="Extract-Transform-Load (ETL)" icon="database">
    **Classic batch processing** - Extract data from sources, transform it, and load into destinations on a schedule
  </Card>
  <Card title="Real-time Streaming" icon="bolt">
    **Event-driven processing** - React to webhooks, API events, or triggers to process data as it arrives
  </Card>
  <Card title="Change Data Capture (CDC)" icon="arrows-rotate">
    **Incremental sync** - Track and sync only changed records between systems efficiently
  </Card>
  <Card title="Multi-API Orchestration" icon="sitemap">
    **Cross-system workflows** - Coordinate data flow across multiple APIs and services in complex sequences
  </Card>
</CardGroup>

## Pattern 1: Scheduled ETL Pipelines

### Basic Daily Sync

```typescript
// Daily customer data synchronization
const dailyCustomerSync = await superglue.buildWorkflow({
  instruction: `
    1. Get all customers updated in last 24 hours from Stripe
    2. Enrich with contact data from HubSpot 
    3. Transform to match our data warehouse schema
    4. Insert into PostgreSQL customers table
    5. Send summary email to data-team@company.com`,
  integrationIds: ["stripe", "hubspot", "postgresql", "email"],
  responseSchema: {
    type: "object",
    properties: {
      processed_customers: { type: "number" },
      new_records: { type: "number" },
      updated_records: { type: "number" },
      errors: { type: "array", items: { type: "string" } },
      execution_time_ms: { type: "number" }
    }
  }
});

// Save for scheduled execution
await superglue.upsertWorkflow("daily-customer-sync", dailyCustomerSync);
```

### Advanced ETL with Error Handling

```typescript
// Production-grade ETL with comprehensive error handling
class ETLPipelineManager {
  private superglue: SuperglueClient;
  
  constructor(apiKey: string) {
    this.superglue = new SuperglueClient({ apiKey });
  }

  async runCustomerDataPipeline() {
    const MAX_RETRIES = 3;
    const BATCH_SIZE = 1000;
    
    try {
      const result = await this.superglue.executeWorkflow({
        workflowId: "daily-customer-sync",
        options: {
          timeout: 1800000, // 30 minutes
          retries: MAX_RETRIES,
          retryDelay: 5000,
          batchSize: BATCH_SIZE,
          webhookUrl: process.env.PIPELINE_WEBHOOK_URL // Async notifications
        }
      });

      if (result.success) {
        await this.logPipelineSuccess(result.data);
        await this.updateDataQualityMetrics(result.data);
        return result.data;
      } else {
        throw new Error(`Pipeline failed: ${result.error}`);
      }
    } catch (error) {
      await this.handlePipelineFailure(error);
      throw error;
    }
  }

  private async handlePipelineFailure(error: Error) {
    // Trigger alerting workflow
    await this.superglue.executeWorkflow({
      workflowId: "pipeline-failure-alert",
      payload: {
        pipeline: "daily-customer-sync",
        error: error.message,
        timestamp: new Date().toISOString(),
        severity: "high"
      }
    });
  }
}
```

## Pattern 2: Real-time Event Processing

### Webhook-Driven Pipelines

```typescript
// React to Stripe payment events in real-time
const paymentProcessingPipeline = await superglue.buildWorkflow({
  instruction: `Process Stripe payment webhook:
    1. Get payment details and customer info from Stripe
    2. Update customer lifetime value in our database
    3. Check if customer qualifies for premium features
    4. Send personalized thank you email
    5. Create entry in analytics events table
    6. Trigger downstream marketing automation`,
  integrationIds: ["stripe", "database", "email", "analytics", "marketing"],
  responseSchema: {
    type: "object", 
    properties: {
      payment_processed: { type: "boolean" },
      customer_upgraded: { type: "boolean" },
      email_sent: { type: "boolean" },
      analytics_tracked: { type: "boolean" },
      processing_time_ms: { type: "number" }
    }
  }
});

// Express.js webhook handler
app.post('/webhooks/stripe', async (req, res) => {
  const webhookData = req.body;
  
  if (webhookData.type === 'payment_intent.succeeded') {
    // Process asynchronously to respond quickly
    setImmediate(async () => {
      try {
        await superglue.executeWorkflow({
          workflowId: "payment-processing-pipeline",
          payload: webhookData,
          options: {
            priority: "high",
            timeout: 30000
          }
        });
      } catch (error) {
        console.error('Payment processing failed:', error);
      }
    });
  }
  
  res.status(200).send('OK');
});
```

### Stream Processing Pattern

```typescript
// Process high-volume events from message queue
class StreamProcessor {
  private superglue: SuperglueClient;
  
  async processEventStream() {
    // Connect to message queue (Redis, Kafka, etc.)
    const eventStream = await this.connectToEventStream();
    
    eventStream.on('message', async (event) => {
      try {
        await this.processEvent(event);
      } catch (error) {
        await this.handleEventError(event, error);
      }
    });
  }
  
  private async processEvent(event: any) {
    const workflow = await this.superglue.executeWorkflow({
      workflowId: "stream-event-processor",
      payload: event,
      options: {
        timeout: 10000, // Fast processing for streams
        cacheResults: true // Cache common transformations
      }
    });
    
    return workflow.data;
  }
}
```

## Pattern 3: Change Data Capture (CDC)

### Incremental Data Sync

```typescript
// Efficiently sync only changed records
const incrementalSyncWorkflow = await superglue.buildWorkflow({
  instruction: `Incremental data synchronization:
    1. Get the last sync timestamp from our control table
    2. Fetch all Salesforce contacts modified since last sync
    3. For each contact, check if it exists in our database
    4. Insert new contacts, update existing ones
    5. Update the last sync timestamp
    6. Log sync statistics`,
  integrationIds: ["salesforce", "postgresql"],
  responseSchema: {
    type: "object",
    properties: {
      last_sync_timestamp: { type: "string" },
      new_records: { type: "number" },
      updated_records: { type: "number" },
      unchanged_records: { type: "number" },
      sync_duration_ms: { type: "number" }
    }
  }
});

// Schedule to run every 15 minutes
await superglue.upsertWorkflowSchedule({
  workflowId: incrementalSyncWorkflow.id,
  cronExpression: "*/15 * * * *",
  timezone: "UTC",
  enabled: true
});

// For complete scheduling guide, see: /guides/scheduling
```

### Delta Detection Pattern

```typescript
// Advanced change detection with checksums
const deltaDetectionPipeline = await superglue.buildWorkflow({
  instruction: `Smart delta detection:
    1. Get current product data from Shopify with checksums
    2. Compare checksums with our stored versions
    3. Identify truly changed records (not just timestamp updates)
    4. Sync only records with actual data changes
    5. Update checksums and timestamps in our tracking table`,
  integrationIds: ["shopify", "database"],
  responseSchema: {
    type: "object",
    properties: {
      total_checked: { type: "number" },
      actual_changes: { type: "number" },
      false_positives: { type: "number" },
      sync_efficiency: { type: "number" }
    }
  }
});
```

## Pattern 4: Multi-API Orchestration

### Complex Business Process Automation

```typescript
// Customer onboarding across multiple systems
const customerOnboardingOrchestration = await superglue.buildWorkflow({
  instruction: `Complete customer onboarding process:
    1. Create customer record in Stripe with payment method
    2. Set up user account in our authentication system
    3. Create contact in HubSpot with onboarding status
    4. Generate welcome email with account details
    5. Create Jira ticket for account manager assignment
    6. Add customer to appropriate Slack channel
    7. Schedule follow-up tasks in project management system
    8. Update analytics dashboard with new customer metrics`,
  integrationIds: ["stripe", "auth0", "hubspot", "email", "jira", "slack", "asana", "analytics"],
  responseSchema: {
    type: "object",
    properties: {
      customer_id: { type: "string" },
      stripe_customer_id: { type: "string" },
      auth0_user_id: { type: "string" },
      hubspot_contact_id: { type: "string" },
      onboarding_complete: { type: "boolean" },
      tasks_created: { type: "number" },
      notifications_sent: { type: "number" }
    }
  }
});
```

### Data Enrichment Pipeline

```typescript
// Enrich customer data from multiple sources
const dataEnrichmentPipeline = await superglue.buildWorkflow({
  instruction: `Customer data enrichment workflow:
    1. Start with basic customer data from our database
    2. Enrich with Clearbit company and person data
    3. Add social media profiles from FullContact
    4. Get technographic data from BuiltWith
    5. Append credit scoring from Experian
    6. Merge all data sources with conflict resolution
    7. Update master customer record with enriched data
    8. Flag data quality issues for manual review`,
  integrationIds: ["database", "clearbit", "fullcontact", "builtwith", "experian"],
  responseSchema: {
    type: "object",
    properties: {
      enriched_customers: { type: "number" },
      data_sources_used: { type: "array", items: { type: "string" } },
      enrichment_score: { type: "number" },
      quality_flags: { type: "array", items: { type: "string" } },
      processing_cost: { type: "number" }
    }
  }
});
```

## Pattern 5: Data Quality & Monitoring

### Data Validation Pipeline

```typescript
// Comprehensive data quality checking
const dataQualityPipeline = await superglue.buildWorkflow({
  instruction: `Data quality validation workflow:
    1. Sample recent records from all critical data sources
    2. Check for completeness (missing fields, null values)
    3. Validate data formats (emails, phones, dates)
    4. Detect duplicates and inconsistencies
    5. Compare against business rules and constraints
    6. Generate data quality report with scores
    7. Create alerts for quality degradation
    8. Suggest remediation actions`,
  integrationIds: ["postgresql", "mongodb", "redis", "email"],
  responseSchema: {
    type: "object",
    properties: {
      overall_quality_score: { type: "number" },
      completeness_score: { type: "number" },
      validity_score: { type: "number" },
      consistency_score: { type: "number" },
      issues_found: { type: "array", items: { type: "object" } },
      recommendations: { type: "array", items: { type: "string" } }
    }
  }
});
```

### Pipeline Monitoring & Alerting

```typescript
// Monitor pipeline health and performance
class PipelineMonitor {
  private superglue: SuperglueClient;
  
  async setupMonitoring() {
    // Create monitoring workflow
    const monitoringWorkflow = await this.superglue.buildWorkflow({
      instruction: `Pipeline health monitoring:
        1. Check status of all critical data pipelines
        2. Measure execution times and success rates
        3. Verify data freshness in target systems
        4. Check for pipeline failures or delays
        5. Calculate SLA compliance metrics
        6. Generate health dashboard data
        7. Send alerts for anomalies or failures`,
      integrationIds: ["monitoring", "database", "slack", "pagerduty"],
      responseSchema: {
        type: "object",
        properties: {
          pipelines_healthy: { type: "number" },
          pipelines_degraded: { type: "number" },
          pipelines_failed: { type: "number" },
          avg_execution_time: { type: "number" },
          sla_compliance: { type: "number" },
          alerts_sent: { type: "number" }
        }
      }
    });

    // Run monitoring every 5 minutes
    setInterval(async () => {
      await this.superglue.executeWorkflow({
        workflowId: "pipeline-monitoring",
        options: { timeout: 60000 }
      });
    }, 5 * 60 * 1000);
  }
}
```

## Error Handling & Recovery

### Resilient Pipeline Design

<CardGroup cols={2}>
  <Card title="Circuit Breaker Pattern" icon="shield">
    **Prevent cascade failures** - Stop calling failing APIs temporarily and retry with exponential backoff
  </Card>
  <Card title="Dead Letter Queues" icon="inbox">
    **Handle poison messages** - Route failed records to separate queues for manual processing or investigation
  </Card>
  <Card title="Compensating Actions" icon="arrow-rotate-left">
    **Rollback on failure** - Automatically undo partial changes when workflows fail midway
  </Card>
  <Card title="Graceful Degradation" icon="chart-line-down">
    **Partial success handling** - Continue processing when some steps fail, marking records appropriately
  </Card>
</CardGroup>

## Deployment & Operations

### Production Deployment Checklist

<Steps>
  <Step title="Environment Setup">
    - Configure production credentials securely
    - Set up monitoring and alerting integrations
    - Configure proper timeout and retry settings
    - Set up logging and audit trails
  </Step>
  <Step title="Testing & Validation">
    - Test workflows with production-like data volumes
    - Validate error handling and recovery scenarios  
    - Load test critical pipelines
    - Verify data quality and transformation accuracy
  </Step>
  <Step title="Deployment Strategy">
    - Use blue-green deployment for critical pipelines
    - Implement gradual rollout with canary testing
    - Set up rollback procedures
    - Configure health checks and readiness probes
  </Step>
  <Step title="Monitoring & Maintenance">
    - Set up comprehensive monitoring dashboards
    - Configure SLA-based alerting
    - Implement automated pipeline health checks
    - Plan for capacity scaling and performance tuning
  </Step>
</Steps>

## Best Practices Summary

<AccordionGroup>
  <Accordion title="Design Principles" icon="compass">
    **Idempotency**: Design workflows to handle duplicate executions safely
    
    **Atomicity**: Make workflows atomic where possible, or implement proper rollback
    
    **Observability**: Include comprehensive logging and monitoring in all pipelines
    
    **Scalability**: Design for growth - consider data volume increases and API rate limits
    
    **Maintainability**: Use clear, descriptive workflow instructions and proper documentation
  </Accordion>
  <Accordion title="Performance Guidelines" icon="gauge">
    **Batch Optimization**: Use appropriate batch sizes for each API (test and measure)
    
    **Parallel Processing**: Leverage superglue's parallel execution capabilities
    
    **Caching Strategy**: Cache expensive API calls and transformations appropriately
    
    **Resource Management**: Monitor memory usage and implement streaming for large datasets
    
    **Network Efficiency**: Minimize API calls through intelligent data fetching strategies
  </Accordion>
  <Accordion title="Reliability Patterns" icon="shield">
    **Error Handling**: Implement comprehensive error handling with proper retry logic
    
    **Circuit Breakers**: Protect against cascading failures from external API issues
    
    **Data Validation**: Validate data at every step to catch issues early
    
    **Backup Strategies**: Have fallback data sources and recovery procedures
    
    **Testing**: Thoroughly test error scenarios and edge cases
  </Accordion>
  <Accordion title="Security & Compliance" icon="lock">
    **Credential Management**: Use secure credential storage and rotation
    
    **Data Privacy**: Implement proper data masking and PII handling
    
    **Audit Logging**: Maintain comprehensive audit trails for compliance
    
    **Access Control**: Implement proper RBAC for pipeline management
    
    **Encryption**: Ensure data encryption in transit and at rest
  </Accordion>
</AccordionGroup>

## Next Steps

<CardGroup cols={2}>
  <Card title="Start Building" icon="hammer" href="https://app.superglue.cloud">
    Try these patterns with your own data sources and see the 10x development speedup
  </Card>
  <Card title="Advanced Patterns" icon="graduation-cap" href="/guides/architecture">
    Learn about superglue's architecture and advanced workflow orchestration capabilities
  </Card>
  <Card title="Production Examples" icon="rocket" href="/guides/hubspot">
    See real-world implementations of these patterns in production environments
  </Card>
  <Card title="API Reference" icon="code" href="/api-reference/overview">
    Explore the complete API for building custom integrations and workflows
  </Card>
</CardGroup>

---