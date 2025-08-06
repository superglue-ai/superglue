---
title: "UI/Chat vs SDK: When to Use Each"
description: "Choose the right interface for your data integration projects"
---

<Info>
  superglue offers multiple interfaces for different workflows. Choose based on
  your use case, team, and deployment requirements.
</Info>

## Quick Decision Guide

<CardGroup cols={2}>
  <Card title="Use UI/Chat When" icon="chat" color="green">
    ✅ **Prototyping** new integrations 

    ✅ **Exploring** APIs and data sources 

    ✅ **Testing** integration ideas quickly 

    ✅ **Collaborating** with non-technical users 

    ✅ **Learning** what's possible with an API 

    ✅ **One-off** data extraction / analysis tasks
  </Card>
  <Card title="Use MCP/SDK When" icon="code" color="blue">
    ✅ **Production** deployments 

    ✅ **Automated** workflows and pipelines 

    ✅ **Custom** error handling and retry logic

    ✅ **Integration** with existing systems 

    ✅ **CI/CD** and version control 

    ✅ **Scale** and performance requirements
  </Card>
</CardGroup>

## UI/Chat Interface Deep Dive

### What Makes It Powerful

The UI/Chat interface is like having a data engineer AI assistant that understands APIs:

<Tabs>
  <Tab title="Natural Language Queries">
    Instead of reading API docs and writing code:

    **Traditional approach:**

    ```bash
    # Research Stripe API
    curl -X GET https://api.stripe.com/v1/customers \
      -H "Authorization: Bearer sk_test_..." \
      -G -d limit=100 -d created[gt]=1640995200
    
    # Write transformation code
    jq '.data[] | {id: .id, email: .email, ...}'
    
    # Handle pagination
    # Handle errors  
    # Format output
    ```

    **superglue UI approach:**

    > "Get all Stripe customers created in 2024, show me their email, subscription status, and total revenue"

    That's it. superglue handles the API calls, pagination, transformations, and formatting.
  </Tab>
  <Tab title="Interactive Development">
    **Iterative refinement:**

    **You:** "Get HubSpot contacts from this year"

    **superglue:** _Returns 1,247 contacts with basic info_

    **You:** "Actually, I only need contacts with 'Enterprise' in their company name and their deal values"

    **superglue:** _Refines the query and returns filtered results_

    **You:** "Perfect\! Now save this as a workflow called 'enterprise-contacts'"

    **superglue:** _Saves the workflow for future use_
  </Tab>
  <Tab title="Automatic Documentation">
    The UI automatically captures and documents your workflows:

    - **What** data was requested
    - **How** it was transformed
    - **When** it was executed
    - **What** errors occurred (if any)
    - **How** to reproduce the same result

    Perfect for team knowledge sharing and compliance requirements.
  </Tab>
</Tabs>

### Best UI/Chat Use Cases

<AccordionGroup>
  <Accordion title="Data Exploration" icon="magnifying-glass">
    **Scenario:** You need to understand what data is available in a new system.
    **Traditional:** Read API docs, write test scripts, examine responses **With
    superglue UI:** \> "Show me what data is available in our Salesforce
    instance" \> "What are the different types of HubSpot deals and their
    properties?" \> "Give me a sample of our PostgreSQL customers table" Get
    immediate answers with actual data samples.
  </Accordion>
  <Accordion title="Stakeholder Demos" icon="presentation">
    **Scenario:** You need to show business stakeholders what data integration is
    possible. **Demo in real-time:** \> "Let me show you what customer data we can
    pull from Stripe..." \> "Here's how we could sync this with our CRM..." \> "And
    we could automatically generate reports like this..." Non-technical
    stakeholders can see exactly what's possible without looking at code.
  </Accordion>
  <Accordion title="Quick Data Fixes" icon="tools">
    **Scenario:** You need to extract or fix data quickly. **Emergency data
    request:** \> "I need all customers who signed up yesterday but didn't receive
    welcome emails" \> "Update all HubSpot contacts missing phone numbers with data
    from our database" \> "Export all Jira tickets created this week for the
    security team" Get results in minutes, not hours.
  </Accordion>
  <Accordion title="Learning & Training" icon="graduation-cap">
    **Scenario:** Team members need to learn about APIs and integrations.
    **Natural learning progression:** 1. Start with simple queries in natural
    language 2. See how superglue translates them to API calls 3. Understand the
    data structures and transformations 4. Graduate to using the SDK for
    production Perfect for onboarding new team members.
  </Accordion>
</AccordionGroup>

## SDK Deep Dive

### Production-Grade Features

<CardGroup cols={2}>
  <Card title="Programmatic Control" icon="sliders">
    ```typescript
    // Full control over execution
    const result = await superglue.executeWorkflow({
      instruction: "Daily customer sync",
      integrationIds: ["stripe", "hubspot"],
      options: {
        timeout: 300000, // 5 minutes
        retries: 3,
        retryDelay: 5000
      }
    });
    ```
  </Card>
  <Card title="Error Handling" icon="shield">
    ```typescript
    try {
      const result = await superglue.executeWorkflow({
        workflowId: "customer-sync"
      });
      
      if (!result.success) {
        await alerting.sendAlert({
          severity: "warning",
          message: `Workflow failed: ${result.error}`,
          workflow: "customer-sync"
        });
      }
    } catch (error) {
      await alerting.sendAlert({
        severity: "critical", 
        message: `System error: ${error.message}`
      });
    }
    ```
  </Card>
  <Card title="Integration Patterns" icon="puzzle">
    ```typescript
    // Integrate with existing systems
    class DataPipeline {
      async runDailySync() {
        const workflows = [
          "stripe-customer-sync",
          "hubspot-deal-sync", 
          "analytics-update"
        ];
        
        for (const workflowId of workflows) {
          await this.executeWithMetrics(workflowId);
        }
      }
      
      private async executeWithMetrics(workflowId: string) {
        const startTime = Date.now();
        const result = await superglue.executeWorkflow({
          id: workflowId,
          credentials: await this.getCredentials()
        });
        
        await metrics.recordExecution({
          workflow: workflowId,
          duration: Date.now() - startTime,
          success: result.success,
          recordCount: result.data?.recordCount || 0
        });
        
        return result;
      }
    }
    ```
  </Card>
  <Card title="CI/CD Integration" icon="git">
    ```yaml
    # GitHub Actions workflow
    name: Deploy Data Pipelines
    on:
      push:
        branches: [main]
    
    jobs:
      deploy:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v2
          - name: Test Workflows
            run: |
              npm install @superglue/client
              npm run test-workflows
          - name: Deploy to Production
            run: |
              node scripts/deploy-workflows.js
            env:
              SUPERGLUE_API_KEY: ${{ secrets.SUPERGLUE_API_KEY }}
    ```
  </Card>
</CardGroup>

### SDK Use Cases

<AccordionGroup>
  <Accordion title="Automated Data Pipelines" icon="pipe">
    **Requirements:**

    - Runs on schedule (hourly, daily, etc.)
    - Handles large datasets reliably
    - Integrates with monitoring and alerting
    - Version controlled and deployable

    ```typescript
    // Production pipeline
    const pipeline = new ScheduledPipeline({
      schedule: "0 2 * * *", // 2 AM daily
      workflows: [
        { id: "extract-stripe-data", timeout: 300000 },
        { id: "transform-customer-data", timeout: 180000 },
        { id: "load-to-warehouse", timeout: 600000 }
      ],
      onError: async (error, workflow) => {
        await slack.sendAlert(`Pipeline failed at ${workflow}: ${error}`);
      },
      onSuccess: async (results) => {
        await dashboard.updateMetrics(results);
      }
    });
    ```
  </Accordion>
  <Accordion title="Real-time Event Processing" icon="bolt">
    **Requirements:**

    - React to webhooks and events
    - Low latency processing
    - Conditional logic and branching
    - Integration with message queues

    ```typescript
    // Webhook handler
    app.post('/webhook/stripe', async (req, res) => {
      const event = req.body;
      
      if (event.type === 'customer.subscription.created') {
        // New subscription - enrich and sync
        await superglue.executeWorkflow({
          workflowId: "new-subscription-handler",
          payload: { 
            customerId: event.data.object.customer,
            subscriptionId: event.data.object.id
          },
          credentials: await getCredentials(),
          options: { 
            priority: "high",
            timeout: 30000 
          }
        });
      }
      
      res.status(200).send('OK');
    });
    ```
  </Accordion>
  <Accordion title="Custom Business Logic" icon="brain">
    **Requirements:**

    - Complex conditional workflows
    - Custom validation and business rules
    - Integration with internal systems
    - Advanced error handling and recovery

    ```typescript
    class CustomerOnboardingOrchestrator {
      async processNewCustomer(customerId: string) {
        // Step 1: Get customer data
        const customer = await superglue.executeWorkflow({
          workflowId: "get-customer-details",
          payload: { customerId }
        });
        
        // Step 2: Business logic  
        if (customer.data.plan_type === 'enterprise') {
          await this.handleEnterpriseCustomer(customer.data);
        } else {
          await this.handleStandardCustomer(customer.data);
        }
        
        // Step 3: Follow-up workflows
        await Promise.all([
          this.setupCustomerPortal(customerId),
          this.scheduleOnboardingCall(customer.data),
          this.updateCRM(customer.data)
        ]);
      }
      
      private async handleEnterpriseCustomer(customer: any) {
        await superglue.executeWorkflow({
          workflowId: "enterprise-setup",
          payload: customer,
          options: { priority: "high" }
        });
      }
    }
    ```
  </Accordion>
</AccordionGroup>

## Migration Path: UI to SDK

### Phase 1: Prototype in UI

<Steps>
  <Step title="Start with Natural Language">
    Use the UI to rapidly prototype and test your integration: \> "Get all
    Salesforce opportunities closed this month with contact details"
  </Step>
  <Step title="Refine and Test">
    Iterate on the query until you get exactly the data you need: \> "Actually, I
    need opportunities over \$10k with the primary contact's email and phone"
  </Step>
  <Step title="Save the Workflow">
    Once it works perfectly: \> "Save this as 'monthly-sales-report'"
  </Step>
</Steps>

### Phase 2: Productionize with SDK

<Steps>
  <Step title="Export Workflow Definition">
    ```typescript
    // Get the workflow definition from UI
    const workflow = await superglue.getWorkflow("monthly-sales-report");
    console.log(JSON.stringify(workflow, null, 2));
    ```
  </Step>
  <Step title="Add Production Features">
    ```typescript
    // Add error handling, monitoring, etc.
    class SalesReportGenerator {
      async generateMonthlyReport() {
        try {
          const result = await superglue.executeWorkflow({
            workflowId: "monthly-sales-report",
            credentials: await this.getCredentials(),
            options: {
              timeout: 300000,
              retries: 2,
              webhookUrl: this.webhookUrl
            }
          });
          
          if (result.success) {
            await this.sendReportToStakeholders(result.data);
            await this.logSuccess(result);
          } else {
            await this.handleError(result.error);
          }
        } catch (error) {
          await this.handleCriticalError(error);
        }
      }
    }
    ```
  </Step>
  <Step title="Deploy and Monitor">
    ```typescript
    // Schedule and monitor
    const scheduler = new WorkflowScheduler({
      workflows: [
        {
          id: "monthly-sales-report",
          schedule: "0 9 1 * *", // 9 AM on 1st of month
          generator: new SalesReportGenerator()
        }
      ],
      monitoring: {
        alertsChannel: "#data-alerts",
        metricsEndpoint: "/metrics/workflows"
      }
    });
    ```
  </Step>
</Steps>

## Team Collaboration Patterns

<Tabs>
  <Tab title="Business Analyst → Data Engineer">
    **Business Analyst** (using UI):

    > "I need a report showing customer churn patterns from our subscription data"

    _Creates and tests the workflow in UI_

    **Data Engineer** (using SDK):

    ```typescript
    // Takes the validated workflow and productionizes it
    const churnAnalysis = new ChurnAnalysisWorkflow({
      workflowId: "customer-churn-analysis", // From BA's work
      schedule: "weekly",
      alerting: true,
      outputFormat: "dashboard"
    });
    ```
  </Tab>
  <Tab title="Data Engineer → Data Scientist">
    **Data Engineer** (using SDK):

    ```typescript
    // Prepares clean, structured data
    const result = await superglue.executeWorkflow({
      workflowId: "ml-feature-extraction",
      responseSchema: {
        type: "object",
        properties: {
          features: {
            type: "array",
            items: {
              customer_id: { type: "string" },
              lifetime_value: { type: "number" },
              engagement_score: { type: "number" }
            }
          }
        }
      }
    });
    
    // Export for ML pipeline
    await fs.writeFile('./ml-features.json', JSON.stringify(result.data));
    ```

    **Data Scientist** (consuming the data):

    ```python
    import json
    import pandas as pd
    
    # Use the clean, structured data
    with open('ml-features.json') as f:
        data = json.load(f)
    
    df = pd.DataFrame(data['features'])
    # ML model training...
    ```
  </Tab>
</Tabs>

## Performance Considerations

<CardGroup cols={2}>
  <Card title="UI/Chat Performance" icon="gauge">
    **Optimized for:**

    - Interactive response times (\< 30 seconds)
    - Small to medium datasets (\< 10k records)
    - Exploratory workflows
    - Real-time feedback

    **Limitations:**

    - Not suitable for large batch processing
    - No parallel execution control
    - Limited customization of timeouts/retries
  </Card>
  <Card title="SDK Performance" icon="rocket">
    **Optimized for:**

    - Large datasets (millions of records)
    - Parallel workflow execution
    - Custom timeout and retry strategies
    - Webhook-based async processing

    **Example:**

    ```typescript
    // Process large dataset with custom settings
    const result = await superglue.executeWorkflow({
      workflowId: "large-data-sync",
      options: {
        timeout: 1800000, // 30 minutes
        async: true, // Use webhooks for completion
        batchSize: 1000, // Process in batches
        parallelism: 5 // Run 5 batches in parallel
      }
    });
    ```
  </Card>
</CardGroup>

## Cost Optimization

<Tabs>
  <Tab title="Development Phase">
    **Use UI/Chat for cost-effective development:**

    - Rapid prototyping without engineering time
    - Validate integrations before committing to development
    - Business stakeholders can test ideas directly
    - Reduce back-and-forth between business and engineering
  </Tab>
  <Tab title="Production Phase">
    **Use SDK for operational efficiency:**

    ```typescript
    // Optimize for cost and performance
    const efficientWorkflow = {
      // Reuse saved workflows (no rebuild cost)
      workflowId: "optimized-customer-sync",
      
      // Batch processing reduces API calls
      options: {
        batchSize: 500,
        
        // Smart retry strategy
        retries: 3,
        retryDelay: 1000,
        
        // Use caching for repeated data
        cacheResults: true,
        cacheDuration: 3600 // 1 hour
      }
    };
    ```
  </Tab>
</Tabs>

## Next Steps

<CardGroup cols={2}>
  <Card title="Try Both Approaches" icon="flask" href="https://app.superglue.cloud">
    Start with the UI to prototype your first integration, then see how to
    productionize it with the SDK
  </Card>
  <Card title="API Ranking Benchmark" icon="trophy" href="/data-engineers/api-ranking">
    See concrete performance comparisons between superglue and traditional
    approaches
  </Card>
  <Card title="Data Pipeline Patterns" icon="pipe" href="/data-engineers/data-pipelines">
    Learn common patterns for different types of data integration projects
  </Card>
  <Card title="Production Examples" icon="code" href="/guides/hubspot">
    See real examples of UI workflows productionized with the SDK
  </Card>
</CardGroup>