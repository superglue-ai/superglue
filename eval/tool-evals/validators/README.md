# Tool Validation Functions

This directory contains validation functions for tool evaluation.

## Overview

Validation functions allow you to define custom assertions to verify that tool outputs meet specific requirements. They provide a flexible alternative to strict JSON matching.

## How It Works

1. **Validation Function Runs**: If provided, runs your custom assertions
2. **LLM Judge (Fallback)**: If validation fails or is skipped, an LLM evaluates the output
3. **Status Determination**: Final status is determined based on both results

## Creating a Validator

Create a TypeScript file that exports a default function:

```typescript
import assert from 'assert';

export default function validate(data: any, payload: any): void {
  // Your validation logic here
  assert(data.users, 'users key must exist');
  assert(Array.isArray(data.users), 'users must be an array');
  assert(data.users.length > 0, 'must have at least one user');
}
```

### Function Signature

```typescript
function validate(data: any, payload: any): void
```

- `data`: The output from the tool execution (`workflowResult.data`)
- `payload`: The input payload passed to the tool (from config)
- Return: Nothing (void). Throw an error if validation fails.

### Validation Patterns

#### Basic Assertions

```typescript
import assert from 'assert';

export default function validate(data: any, payload: any): void {
  // Check existence
  assert(data.customers, 'customers must exist');
  
  // Check types
  assert(typeof data.total === 'number', 'total must be a number');
  assert(Array.isArray(data.items), 'items must be an array');
  
  // Check values
  assert(data.total >= 0, 'total must be non-negative');
  assert(data.items.length > 0, 'items array cannot be empty');
}
```

#### Flexible Validations

```typescript
export default function validate(data: any, payload: any): void {
  // Check if key exists (don't care about exact value)
  if (!('customers' in data)) {
    throw new Error('customers key must be present');
  }
  
  // Check array length range
  if (!Array.isArray(data.items) || data.items.length < 5 || data.items.length > 100) {
    throw new Error('items must be an array with 5-100 elements');
  }
}
```

#### Payload-Based Validation

```typescript
export default function validate(data: any, payload: any): void {
  // Use payload to determine expectations
  if (payload.userId) {
    assert(data.userId === payload.userId, 'returned userId must match input');
  }
  
  if (payload.minCount) {
    assert(data.items.length >= payload.minCount, 
      `must have at least ${payload.minCount} items`);
  }
}
```

#### Deep Object Validation

```typescript
export default function validate(data: any, payload: any): void {
  assert(data.user, 'user object must exist');
  assert(data.user.name, 'user.name must exist');
  assert(data.user.email, 'user.email must exist');
  assert(data.user.email.includes('@'), 'user.email must be valid');
  
  // Validate nested arrays
  if (data.orders) {
    assert(Array.isArray(data.orders), 'orders must be an array');
    data.orders.forEach((order: any, i: number) => {
      assert(order.id, `order[${i}].id must exist`);
      assert(typeof order.total === 'number', `order[${i}].total must be a number`);
    });
  }
}
```

## Using Validators in Config

### Option 1: With Validation Function

```json
{
  "id": "my-tool",
  "name": "My Tool",
  "type": "retrieval",
  "instruction": "Get all customers",
  "integrationIds": ["my-api"],
  "validationFunction": "validators/my-tool-validator.ts",
  "expectedResultDescription": "Should return a list of customer objects with name and email"
}
```

### Option 2: Skip Validation Function (LLM Only)

```json
{
  "id": "my-tool",
  "name": "My Tool",
  "type": "retrieval",
  "instruction": "Generate a creative story",
  "integrationIds": ["openai"],
  "skipValidationFunction": true,
  "expectedResultDescription": "Should return a creative story about a robot"
}
```

### Option 3: No Validation

```json
{
  "id": "my-tool",
  "name": "My Tool",
  "type": "action",
  "instruction": "Post a message",
  "integrationIds": ["slack"]
}
```

## Validation Flow

```
Tool Execution
      ↓
  Success?
      ↓ Yes
Has validationFunction?
      ↓ Yes
Run Validation Function
      ↓
  Pass? → Status: VALIDATION_PASSED
      ↓ Fail
Run LLM Judge
      ↓
LLM says "passes"? → Status: VALIDATION_FAILED_LLM_PASSED (counts as success)
LLM says "partial"? → Status: VALIDATION_FAILED_LLM_PARTIAL (counts as failure)
LLM says "failed"? → Status: VALIDATION_FAILED_LLM_FAILED (counts as failure)
```

## LLM Judge Configuration

Configure the LLM used for judging in your config:

```json
{
  "llmConfig": {
    "provider": "openai",
    "model": "gpt-4o"
  }
}
```

Defaults to `openai` and `gpt-4o` if not specified.

## Best Practices

1. **Start Simple**: Begin with basic assertions and add complexity as needed
2. **Clear Error Messages**: Make error messages descriptive for debugging
3. **Use LLM for Fuzzy Cases**: For subjective outputs (e.g., creative text), skip validation function and use LLM only
4. **Test Your Validators**: Create test cases to ensure validators work correctly
5. **Don't Over-Validate**: Focus on critical requirements, let LLM handle minor variations
6. **Use Type Guards**: Add type checks before accessing nested properties

## Examples

See `example-validator.ts` for a template with common patterns.


