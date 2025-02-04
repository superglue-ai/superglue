---
title: 'Product Data from Shopify'
description: 'Guide for Shopify Product Catalog Extraction'
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