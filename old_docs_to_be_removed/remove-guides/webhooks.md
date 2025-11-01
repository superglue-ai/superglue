---
title: "Using webhooks with superglue"
description: "Process webhook notifications from Stripe and other services using superglue workflows"
---

When services like Stripe need to notify your application about events (payment completed, subscription updated, invoice paid), they send webhook requests to your endpoints. This guide shows how to use superglue workflows to process these webhook notifications reliably.

## How It Works

The flow looks like this:

1. **Webhook arrives**: Stripe sends a POST request to your webhook endpoint
2. **Your app receives**: Your application receives the webhook and extracts the payload  
3. **superglue processes**: Your app triggers a superglue workflow with the webhook data
4. **Workflow executes**: superglue processes, transforms, and validates the data
5. **Actions taken**: Additional API calls, database updates, or notifications as needed

## Installation

```bash
npm install @superglue/client
npm install zod zod-to-json-schema
```

## Basic Setup

### 1. Create Integrations

First, set up integrations for the services you'll be calling from your webhook workflows.

```typescript
import { SuperglueClient } from "@superglue/client";

const client = new SuperglueClient({
  apiKey: "your-api-key"
});

// Create Stripe integration
await client.upsertIntegration({
  id: "stripe",
  name: "Stripe API",
  urlHost: "https://api.stripe.com",
  credentials: {
    api_key: "sk_test_..." // Your Stripe secret key
  },
  documentationUrl: "https://stripe.com/docs/api"
});

// Optional: Create other integrations for your business logic
await client.upsertIntegration({
  id: "your-database",
  name: "Your Database API",
  urlHost: "https://api.yourapp.com",
  credentials: {
    api_key: "your_internal_api_key"
  }
});
```

### 2. Create Webhook Processing Workflows

#### Stripe Payment Webhook

```typescript
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Define expected output schema
const paymentProcessedSchema = z.object({
  payment_id: z.string(),
  customer_id: z.string(),
  amount: z.number(),
  status: z.string(),
  customer_email: z.string(),
  updated_at: z.string()
});

// Build workflow to process Stripe payment webhooks
const stripePaymentWorkflow = await client.buildWorkflow({
  instruction: "Process Stripe payment.succeeded webhook: fetch payment details, get customer info, and format the response",
  integrationIds: ["stripe"],
  payload: {
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_example123",
        customer: "cus_example456"
      }
    }
  },
  responseSchema: zodToJsonSchema(paymentProcessedSchema)
});

// Save the workflow
await client.upsertWorkflow("stripe-payment-webhook", stripePaymentWorkflow);
```

#### Stripe Subscription Webhook

```typescript
const subscriptionUpdateSchema = z.object({
  subscription_id: z.string(),
  customer_id: z.string(),
  status: z.string(),
  current_period_end: z.string(),
  plan_name: z.string(),
  amount: z.number()
});

const stripeSubscriptionWorkflow = await client.buildWorkflow({
  instruction: "Process Stripe customer.subscription.updated webhook: get subscription and customer details",
  integrationIds: ["stripe"],
  payload: {
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_example123",
        customer: "cus_example456",
        status: "active"
      }
    }
  },
  responseSchema: zodToJsonSchema(subscriptionUpdateSchema)
});

await client.upsertWorkflow("stripe-subscription-webhook", stripeSubscriptionWorkflow);
```

### 3. Set Up Your Webhook Endpoints

Create endpoints in your application that receive webhooks and trigger superglue workflows.

#### Express.js Example

```typescript
import express from 'express';
import { SuperglueClient } from "@superglue/client";

const app = express();
const client = new SuperglueClient({ apiKey: "your-api-key" });

app.use(express.json());

// Stripe webhook endpoint
app.post('/webhooks/stripe', async (req, res) => {
  try {
    const webhookData = req.body;
    
    // Verify webhook signature (recommended)
    // const signature = req.headers['stripe-signature'];
    // stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    
    // Handle different Stripe webhook types
    switch (webhookData.type) {
      case 'payment_intent.succeeded':
        const paymentResult = await client.executeWorkflow({
          workflow: { id: "stripe-payment-webhook" },
          payload: webhookData,
          options: {
            timeout: 30000,
            retries: 3
          }
        });
        
        if (paymentResult.success) {
          console.log('Payment processed:', paymentResult.data);
          // Additional logic like sending emails, updating database, etc.
        }
        break;
        
      case 'customer.subscription.updated':
        const subscriptionResult = await client.executeWorkflow({
          workflow: { id: "stripe-subscription-webhook" },
          payload: webhookData,
          options: {
            timeout: 30000,
            retries: 3
          }
        });
        
        if (subscriptionResult.success) {
          console.log('Subscription updated:', subscriptionResult.data);
          // Update user access, send notifications, etc.
        }
        break;
        
      default:
        console.log('Unhandled webhook type:', webhookData.type);
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Webhook server running on port 3000');
});
```

#### Next.js API Route Example

```typescript
// pages/api/webhooks/stripe.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { SuperglueClient } from "@superglue/client";

const client = new SuperglueClient({ 
  apiKey: process.env.SUPERGLUE_API_KEY 
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const webhookData = req.body;
    
    if (webhookData.type === 'payment_intent.succeeded') {
      const result = await client.executeWorkflow({
        workflow: { id: "stripe-payment-webhook" },
        payload: webhookData
      });
      
      if (result.success) {
        // Process the structured data from superglue
        const paymentData = result.data;
        
        // Your business logic here
        await updateUserAccount(paymentData.customer_id, paymentData.amount);
        await sendConfirmationEmail(paymentData.customer_email);
      }
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook processing failed:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
}
```

## Sending Workflow Results to Webhooks

You can configure superglue to automatically send workflow execution results to a webhook URL. This is useful for:
- Notifying external systems when workflows complete
- Triggering downstream processes (e.g. AWS Lambda functions)
- Logging workflow results to external monitoring systems

### Basic Usage

Simply add a `webhookUrl` in the options when executing a workflow:

```typescript
import { SuperglueClient } from "@superglue/client";

const client = new SuperglueClient({ apiKey: "your-api-key" });

// Execute workflow and send results to a webhook
const result = await client.executeWorkflow({
  id: "your-workflow-id",
  payload: { 
    // your input data
  },
  options: {
    webhookUrl: "https://your-webhook-endpoint.com/webhook",
    timeout: 30000,
    retries: 3
  }
});
```

### Webhook Payload Format

The webhook will receive a POST request with the following JSON payload:

```json
// On success:
{
  "callId": "workflow-run-id",
  "success": true,
  "data": {
    // your workflow output data
  }
}

// On failure:
{
  "callId": "workflow-run-id", 
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### Important Notes

- **Fire-and-forget**: Webhook notifications are sent asynchronously and won't delay the workflow response
- **Retries**: Failed webhook deliveries are automatically retried 3 times with a 10-second delay
- **Timeout**: Webhook requests have a 10-second timeout
- **No blocking**: Webhook failures don't affect the workflow execution or response

## Advanced Patterns

### Workflow Chaining

Process webhooks that trigger multiple downstream actions:

```typescript
// Create a complex workflow that processes payment and updates multiple systems
const paymentFullProcessWorkflow = await client.buildWorkflow({
  instruction: `Process Stripe payment webhook and:
    1. Get payment and customer details from Stripe
    2. Update user account in our database 
    3. Send confirmation email
    4. Create invoice record`,
  integrationIds: ["stripe", "database", "email-service"],
  payload: webhookData,
  responseSchema: zodToJsonSchema(z.object({
    payment: z.object({
      id: z.string(),
      amount: z.number(),
      status: z.string()
    }),
    customer_updated: z.boolean(),
    email_sent: z.boolean(),
    invoice_created: z.boolean()
  }))
});
```

## Testing

### 1. Use Webhook Testing Tools

```bash
# Install stripe CLI for testing
npm install -g stripe-cli

# Forward webhooks to local development
stripe listen --forward-to localhost:3000/webhooks/stripe
```

### 2. Test Workflows Independently

```typescript
// Test your workflow with sample data
const testResult = await client.executeWorkflow({
  workflow: { id: "stripe-payment-webhook" },
  payload: {
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test123",
        customer: "cus_test456",
        amount: 2000,
        currency: "usd"
      }
    }
  }
});

console.log('Test result:', testResult.data);
```

## Other Webhook Providers

The same pattern works for any service that sends webhooks. Examples:

- **Plaid**: `webhook_type: "TRANSACTIONS"` for bank account updates
- **GitHub**: `action: "opened"` for new pull requests  
- **Shopify**: `topic: "orders/create"` for new orders
- **Twilio**: `MessageStatus: "delivered"` for SMS updates

Just create the appropriate integrations and workflows for your specific use case.

## Best Practices

1. **Idempotency**: Handle duplicate webhooks gracefully
2. **Fast Response**: Respond to webhooks quickly (\< 10s), do heavy processing asynchronously  
3. **Verify Signatures**: Always verify webhook signatures in production
4. **Graceful Failures**: Return appropriate HTTP status codes
5. **Monitoring**: Log webhook processing for debugging
6. **Schema Validation**: Use superglue's schema validation to ensure data integrity

Stripe webhooks with superglue give you reliable, self-healing data processing that adapts when Stripe's API changes, while maintaining the exact data format your application expects.
