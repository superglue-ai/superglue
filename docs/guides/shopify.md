---
title: 'Shopify'
description: 'Cookbook for Shopify Product Catalog Extraction'
---

# Quickstart Guide

This guide demonstrates how to use Superglue to transform Shopify product data into a standardized format.

## Installation

```bash
npm install @superglue/superglue
```

## Working Example: Shopify Product Data

Let's transform a Shopify store's product data into a clean, standardized format that's easier to work with.

### Basic Product Extraction

```typescript
import { SuperglueClient } from "@superglue/superglue";

const config = {
  urlHost: "https://hydrogen-preview.myshopify.com",
  urlPath: "/products.json",
  instruction: "Extract product details including variants, normalize prices to numbers, and ensure consistent image URLs",
  method: "GET",
  responseSchema: {
    type: "object",
    properties: {
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            url: { 
                type: "string",
                description: "The full URL of the product including the shopify domain and the product handle"
            },
            price: { 
              type: "number",
              description: "Lowest variant price"
            },
            variants: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  sku: { type: "string" },
                  price: { type: "number" },
                  inventory_quantity: { type: "integer" },
                  title: { type: "string" }
                }
              }
            },
            images: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  url: { type: "string" },
                  alt: { type: "string" }
                }
              }
            }
          }
        }
      }
    }
  }
};

// Complete working script
async function main() {
  const superglue = new SuperglueClient({
    apiKey: "your-auth-token"
  });

  try {
    const result = await superglue.call({
      endpoint: config
    });

    if (result.success) {
      console.log("Transformed products:");
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.error("Error:", result.error);
    }

  } catch (error) {
    console.error("Failed to fetch products:", error);
  }
}

main();

/* Example Output:
{
  "products": [
    {
      "id": "6857243132089",
      "title": "The Multi-location Snowboard",
      "url": "the-multi-location-snowboard",
      "price": 749.95,
      "variants": [
        {
          "id": "40145544159401",
          "sku": "SNOW-742",
          "price": 749.95,
          "inventory_quantity": 10,
          "title": "154cm"
        }
      ],
      "images": [
        {
          "url": "https://cdn.shopify.com/s/files/1/0551/4566/0472/products/snowboard-1.jpg",
          "alt": "The Multi-location Snowboard"
        }
      ]
    }
  ]
}
*/
```

### Handling Variants and Inventory

Here's a more specific example focusing on inventory management:

```typescript
const inventoryConfig = {
  urlHost: "https://hydrogen-preview.myshopify.com",
  urlPath: "/products.json",
  instruction: "Extract product variants with inventory details, format as inventory items",
  method: "GET",
  responseSchema: {
    type: "object",
    properties: {
      inventory: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sku: { type: "string" },
            product_name: { type: "string" },
            variant_name: { type: "string" },
            quantity: { type: "integer" },
            price: { type: "number" },
            requires_shipping: { type: "boolean" }
          },
          required: ["sku", "product_name", "quantity", "price"]
        }
      }
    }
  }
};

// Superglue will automatically transform the Shopify format into this inventory structure
const result = await superglue.call({
  endpoint: inventoryConfig
});

/* Example Output:
{
  "inventory": [
    {
      "sku": "SNOW-742",
      "product_name": "The Multi-location Snowboard",
      "variant_name": "154cm",
      "quantity": 10,
      "price": 749.95,
      "requires_shipping": true
    },
    {
      "sku": "SNOW-743",
      "product_name": "The Multi-location Snowboard",
      "variant_name": "158cm",
      "quantity": 8,
      "price": 749.95,
      "requires_shipping": true
    }
  ]
}
*/
```

### Processing Multiple Pages

Shopify paginates results, so let's handle that:

```typescript
const paginatedConfig = {
  urlHost: "https://hydrogen-preview.myshopify.com",
  urlPath: "/products.json",
  method: "GET",
  pagination: {
    type: "PAGE_BASED",
    pageSize: 50  // Shopify's default
  },
  queryParams: {
    "limit": "{pageSize}",
    "page": "{page}"
  }
};

const result = await superglue.call({
  endpoint: paginatedConfig,
  options: {
    timeout: 30000  // 30 seconds for larger datasets
  }
});
```

### Error Handling with Retries

```typescript
try {
  const result = await superglue.call({
    endpoint: config,
    options: {
      retries: 3,
      retryDelay: 1000,  // 1 second between retries
      timeout: 5000      // 5 second timeout
    }
  });

  if (!result.success) {
    if (result.error?.includes("rate limit")) {
      console.error("Rate limited by Shopify");
    } else {
      console.error("API Error:", result.error);
    }
    return;
  }

  console.log(`Successfully processed ${result.data.products.length} products`);
} catch (error) {
  console.error("Failed to process products:", error.message);
}
```

## Common Use Cases

1. **Inventory Sync**
   - Transform Shopify product data for your inventory system
   - Normalize SKUs and variant structures
   - Extract only in-stock items

2. **Product Catalog**
   - Create a clean product feed for marketing platforms
   - Normalize image URLs and metadata
   - Format prices consistently

3. **Analytics**
   - Extract product performance metrics
   - Transform data for analytics platforms
   - Aggregate variant data

## Next Steps

- Check the [API Reference](./api-reference/types.md) for detailed type information
- Learn about [Caching](./api-reference/overview.md#cache-modes) to optimize performance
- Join our [Discord](https://discord.gg/SKRYYQEp) for support 