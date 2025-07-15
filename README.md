
<p align="center">
  <img src="https://github.com/user-attachments/assets/be0e65d4-dcd8-4133-9841-b08799e087e7" width="350" alt="superglue_logo_white">
</p>

<h2 align="center">Integrate & Orchestrate APIs with natural language.</h2>
<div align="center">
  
 [![GitHub](https://img.shields.io/github/license/superglue-ai/superglue?style=flat-square)](https://github.com/superglue-ai/superglue/blob/main/LICENSE)
[![Y Combinator](https://img.shields.io/badge/Y%20Combinator-W25-orange?style=flat-square)](https://www.ycombinator.com/companies/superglue)
[![Client SDK](https://img.shields.io/npm/v/@superglue/client?style=flat-square&logo=npm)](https://www.npmjs.com/package/@superglue/client)
[![Docker](https://img.shields.io/docker/pulls/superglueai/superglue?style=flat-square&logo=Docker)](https://hub.docker.com/r/superglueai/superglue)
[![Weave Badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fapp.workweave.ai%2Fapi%2Frepository%2Fbadge%2Forg_0S2o9PLamHvNsTjHbszc38vC%2F914997268&cacheSeconds=3600&labelColor=#EC6341)](https://app.workweave.ai/reports/repository/org_0S2o9PLamHvNsTjHbszc38vC/914997268)

</div>
<h3 align="center"> Now live: let agents build deterministic workflows across apps, databases and APIs using the superglue MCP<br>
Let's glue.<br>

[Read the docs](https://docs.superglue.cloud/mcp) 🍯🍯🍯</h3>


## what is superglue?
superglue orchestrates APIs from natural language. Tell it what you want to do in your CRM, ERP and co. and superglue builds, runs and executes the integration pipelines automatically. Comes with automated schema mapping, drift detection, retries and remappings so your API workflows keep running no matter what. 
superglue makes agents reliable in prod by letting them build deterministic workflows across any SaaS app, API and data source. Use the superglue MCP instead of hard-coding tools and let your agent use APIs the way they want to, not the way they were written. 

- Lightweight proxy: point it at any REST / GraphQL / SQL / postgres / file endpoint.
- LLM‑assisted mapping during config; cached Javascript transforms at runtime (no LLM latency).
- Self‑heals schema drift: when the upstream API or schema changes, superglue regenerates the transform automatically, and keeps the pipeline running.
- Security‑first: zero data stored; run fully on‑prem or use [our hosted version](https://app.superglue.cloud/).

## quick start
### hosted version

1. Run on our [cloud-hosted version](https://superglue.ai)

2. Install the superglue js/ts client:
```bash
npm install @superglue/client
```

3. Configure your first api call:
```javascript
import { SuperglueClient } from "@superglue/client";

const superglue = new SuperglueClient({
  apiKey: "************"
});

const workflowResult = await superglue.executeWorkflow({
  // input can be an ID of a pre-saved workflow or a WorkflowInput object
    workflow: {
      id: "myTodoUserWorkflow",
      steps: [
        {
          id: "fetchTodos", // Unique ID for this step
          apiConfig: {
            id: "jsonplaceholderTodos",
            urlHost: "https://jsonplaceholder.typicode.com",
            urlPath: "/todos",
            method: HttpMethod.GET,
            instruction: "Fetch a list of todos. We only need the first one for this example.",
          },
        },
        {
          id: "fetchUser",
          apiConfig: {
            id: "jsonplaceholderUsers",
            urlHost: "https://jsonplaceholder.typicode.com",
            urlPath: "/users/<<$.fetchTodos[0].userId>>", // JSONata path parameter for first userId
            method: HttpMethod.GET,
            instruction: "Fetch user details by user ID for the first todo."
          },
        },
      ],
      // Transform the results of the steps into the final desired output. If not given, this will be generated from the reponse schema
      finalTransform: "$",
      responseSchema: { // define the expected final output structure
        type: "object",
        description: "first todo",
        properties: {
            todoTitle: { type: "string" },
            userName: { type: "string" }
        }
      }
  },
  // `payload` could be used to pass initial data to the first step if needed. E.g. IDs to fetch, filters, etc. In short, things that can change across calls.
  // payload: { userId: 1 },
  // `credentials` can be used to authenticate requests. They need to be referenced in the api config (e.g. "headers": {"Authorization": "Bearer <<hubspot_api_key>>"})
  // credentials: { hubspot_api_key: "pa_xxx" },      
});
console.log(JSON.stringify(workflowResult, null, 2));
```

## what people build with superglue
- Voice assistants: reliably map intent to tool usage
- Extended GPT: offer more data sources and a whitelabel agent builder inside your internal GPT
- Extend AI assistant/co-pilot: offer more actions than search 
- Ship connectors 10x faster, without the maintenance overhead
- Simple interface for legacy API pipelines
- CMS or cloud migration
- Transforming SQL queries into Rest API calls
- And many more...


## key features

- **API Proxy**: Configure APIs and intercept responses in real-time with minimal added latency
- **LLM-Powered Data Mapping**: Automatically generate data transformations using large language models 
- **Schema Validation**: Ensure data compliance with your specified schemas
- **File Processing**: Handle various file formats (CSV, JSON, XML) with automatic decompression
- **Flexible Authentication**: Support for various auth methods including header auth, api keys, oauth, and more
- **Smart Pagination**: Handle different pagination styles automatically
- **Caching & Retry Logic**: Built-in caching and configurable retry strategies

## 📖 Documentation

For detailed documentation, visit [docs.superglue.cloud](https://docs.superglue.cloud).

## 🤝 contributing
We love contributions! Feel free to open issues for bugs or feature requests.

[//]: # (To contribute to the docs, check out the /docs folder.)

## license

superglue is GPL licensed. The superglue client SDKs are MIT licensed. See [LICENSE](LICENSE) for details.

## Next Steps

- [Join our Discord](https://discord.gg/vUKnuhHtfW)
- [Read our docs](https://docs.superglue.cloud/introduction)
- [Book a sales call](https://cal.com/superglue/superglue-demo)

Text us! <br>
[![Twitter Adina](https://img.shields.io/twitter/follow/adinagoerres?style=flat-square&logo=X)](https://twitter.com/adinagoerres)
[![Twitter Stefan](https://img.shields.io/twitter/follow/sfaistenauer?style=flat-square&logo=X)](https://twitter.com/sfaistenauer)
[![Twitter](https://img.shields.io/twitter/follow/superglue_d?style=social)](https://twitter.com/superglue_d)

