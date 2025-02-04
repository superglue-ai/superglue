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
        },
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