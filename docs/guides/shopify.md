---
title: 'Product Data from Shopify'
description: 'Cookbook for Shopify Product Catalog Extraction'
---

When you're building an application that needs Shopify product data, you typically face a few challenges:
- The Shopify API returns a complex data structure that might not match your needs
- You need to handle pagination, variants, and images
- You want to transform the data into your own format

Let's see how superglue makes this easy.

## Installation

```bash
npm install @superglue/client
npm install zod zod-to-json-schema

# get early access to hosted version via https://superglue.cloud or [self-host](self-hosting).
```

## Basic Product Extraction

Let's get started by importing the client and defining the schema that you need the data in. Then you can use the `call` method to fetch the product data and transform it. `call` just needs a configuration object that describes the data source and the output schema you want.

```typescript
import { SuperglueClient } from "@superglue/client";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Define the schema using Zod
const productSchema = z.object({
  products: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().describe("The full URL of the product including the shopify domain and the product handle"),
      from_price: z.number().describe("Lowest variant price"),
      variants: z.array(
        z.object({
          id: z.string(),
          price: z.number(),
          title: z.string(),
        })
      ),
      images: z.array(
        z.object({
          url: z.string(),
          number: z.number(),
        })
      ),
    })
  ),
});

// give the host url and some basic instruction
const config = {
  urlHost: "https://hydrogen-preview.myshopify.com",
  urlPath: "/products.json",
  instruction: "Extract product details including variants from all products from https://hydrogen-preview.myshopify.com.",
  responseSchema: zodToJsonSchema(productSchema),
};

// Complete working script
async function main() {
  try {
    const result = await superglue.call({
      endpoint: config,
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
```

### What's Happening Here?

1. **Schema Definition**: We define a simple schema that includes:
   - Basic product info (id, title, url)
   - Price information (lowest variant price)
   - Variants with their prices
   - Product images

2. **Configuration**: The `config` object tells Superglue:
   - Where to get the data (`urlHost` and `urlPath`)
   - What to do with it (`instruction`)
   - What format we want (`responseSchema`)

Notice that superglue will automatically fill the missing parts of the configuration. For example, it will detect the required Http Method `GET` and handle pagination for you if instructed or detected.

One quirk of the Shopify API is that it does not include a url field in the product object. It can be derived from the `handle` and the shopdomain. As long as the instruction includes the shopdomain, superglue will be able to derive the url using implicit knowledge about the Shopify API.

3. **Execution**: When you run this code:
   - First run: Superglue fetches the data and transforms it (~10-20 seconds)
   - Subsequent runs: superglue will fetch the data from the source, while the transformation instructions are cached.(typically <100ms)

### Understanding the Response

The transformed data will look like this:
```json
{
  "products": [
    {
      "id": "shop_123",
      "title": "Classic T-Shirt",
      "url": "https://hydrogen-preview.myshopify.com/products/classic-t-shirt",
      "from_price": 19.99,
      "variants": [
        {
          "id": "var_456",
          "price": 19.99,
          "title": "Small / Black"
        }
        {
          "id": "var_457",
          "price": 29.99,
          "title": "Large / Black"
        }
      ],
      "images": [
        {
          "url": "https://cdn.shopify.com/...",
          "number": 1
        }
      ]
    }
  ]
}
```

The response will also include the used configuration, the applied mapping, and some metadata. 
The generated JSONata mapping instruction will include the from_price which is derived from the lowest variant price. The url will be derived from the handle and the shopdomain. The complete JSONata mapping instruction will look something like this:

```jsonata
{
  "products": [
    $.{
      "id": $string(id),
      "title": title,
      "url": "https://hydrogen-preview.myshopify.com/products/" & handle,
      "from_price": $min($map(variants, function($v) { $number($v.price) })),
      "variants": [
        variants.{
          "id": $string(id),
          "price": $number(price),
          "title": title
        }
      ],
      "images": [
        images.{
          "url": src,
          "number": position
        }
      ]
    }
  ]
}
```

## Handling Variants and Inventory

The next example shows how to focus on inventory:

```typescript
const inventoryConfig = {
  urlHost: "https://hydrogen-preview.myshopify.com",
  urlPath: "/products.json",
  instruction: "Extract product variants with inventory details, format as inventory items",
  responseSchema: {
    type: "object",
    properties: {
      inventory: {
        type: "array",
        items: {
          type: "object",
          properties: {
            product_name: { type: "string" },
            variant_name: { type: "string" },
            weight: { type: "number" },
            price: { type: "number" },
            requires_shipping: { type: "boolean" }
          },
        }
      }
    }
  }
};

// Superglue will automatically transform the Shopify format into this inventory structure
const result = await superglue.call({
  endpoint: inventoryConfig
});
```

This configuration transforms Shopify's data into a flat inventory structure - perfect for stock management systems.

The corresponding mapping instruction will look something like this:

```
{
  "inventory": [
    $.variants.{
      "product_name": %.title,
      "variant_name": title,
      "weight": $number(grams),
      "price": $number(price),
      "requires_shipping": requires_shipping
    }
  ]
}
```

## Working with Pagination

Shopify limits results to 250 products per page. Usually, superglue will automatically handle this for you. Since this specific part of the API is not well defined, you can also manually handle it by providing the `pagination` configuration. You could also just write it in the instruction, particularly if you are unsure aboute the exact pagination parameters.

```typescript
const paginatedConfig = {
  urlHost: "https://hydrogen-preview.myshopify.com",
  urlPath: "/products.json",
  instruction: "Extract product details including variants from all products from https://hydrogen-preview.myshopify.com.",
  method: "GET",
  pagination: {
    type: "PAGE_BASED",
    pageSize: 50 // just to be safe
  },
  queryParams: {
    "limit": "{pageSize}",
    "page": "{page}"
  }
};

const result = await superglue.call({
  endpoint: paginatedConfig
});
```

The pagination config automatically:
- Fetches all pages
- Combines the results
- Handles rate limiting

## Next Steps

- Check the [API Reference](./api-reference/types.md) for detailed type information
- Join our [Discord](https://discord.gg/SKRYYQEp) for support 