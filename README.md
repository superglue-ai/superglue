
<p align="center">
  <img src="https://github.com/user-attachments/assets/be0e65d4-dcd8-4133-9841-b08799e087e7" width="350" alt="superglue_logo_white">
</p>

<h2 align="center">self-healing integration agent 🍯</h2>

superglue is a self-healing integration agent. You can deploy it as a proxy between you and any complex / legacy APIs and always get the data that you want in the format you expect.

Here's how it works: You prompt superglue in natural language (like "get all issues from jira"), provide an API URL, and superglue transforms the prompt into corresponding API calls. 
What superglue does under the hood:
- Automatically generates the API configuration by analyzing API docs.
- Handles pagination, authentication, and error retries.
- Creates deterministic transformations (using JSONata for creating transformation rules), into the exact schema you need.
- Validates that all data coming through follows that schema, and automatically fixes transformations when they break.

superglue uses LLMs only during configuration setup and transformation rule creation, making the glueing process deterministic and extremely efficient in terms of latency and cost.

<div align="center">

[![GitHub](https://img.shields.io/github/license/superglue-ai/superglue?style=flat-square)](https://github.com/superglue-ai/superglue/blob/main/LICENSE)
[![Y Combinator](https://img.shields.io/badge/Y%20Combinator-W25-orange?style=flat-square)](https://www.ycombinator.com/companies/superglue)
[![Client SDK](https://img.shields.io/npm/v/@superglue/client?style=flat-square&logo=npm)](https://www.npmjs.com/package/@superglue/client)
[![Docker](https://img.shields.io/docker/pulls/superglueai/superglue?style=flat-square&logo=Docker)](https://hub.docker.com/r/superglueai/superglue)
[![Twitter Adina](https://img.shields.io/twitter/follow/adinagoerres?style=flat-square&logo=X)](https://twitter.com/adinagoerres)
[![Twitter Stefan](https://img.shields.io/twitter/follow/sfaistenauer?style=flat-square&logo=X)](https://twitter.com/sfaistenauer)
[![Weave Badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fapp.workweave.ai%2Fapi%2Frepository%2Fbadge%2Forg_0S2o9PLamHvNsTjHbszc38vC%2F914997268&cacheSeconds=3600&labelColor=#EC6341)](https://app.workweave.ai/reports/repository/org_0S2o9PLamHvNsTjHbszc38vC/914997268)


</div>

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

/*
output:
{
  "characters": [
    {
      "name": "Phillip J. Fry",
      "species": "human"
    },
    ...
  ]
}
*/
```

### self-hosted version

Run your own instance of superglue using Docker:

1. Pull the Docker image:
```bash
docker pull superglueai/superglue
```

2. Create a `.env` by copying the `.env.example` file at the root

3. Start the server:
```bash
docker run -d \
  --name superglue \
  --env-file .env \
  -p 3000:3000 \
  -p 3001:3001 \
  superglueai/superglue
```

4. Verify the installation:
```bash
curl http://localhost:3000/health
> OK

# or open http://localhost:3000/?token=your-auth-token
```

5. Open the dashboard to create your first configuration:
```bash
http://localhost:3001/
```

6. run your first call:
```bash
npm install @superglue/client
```

```javascript
import { SuperglueClient } from "@superglue/client";

const superglue = new SuperglueClient({
  endpoint: "http://localhost:3000",
  apiKey: "your-auth-token"
});

// either via config object
const config = {
  id: "futurama-characters",
  urlHost: "https://futuramaapi.com",
  urlPath: "/graphql",
  instruction: "get all characters from the show",
};

const result = await superglue.call({endpoint: config});

// or via the api id if you have already created the endpoint
const result2 = await superglue.call({id: "futurama-characters"});

console.log(JSON.stringify(result.data, null, 2));
```


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

## 🙋‍♂️ support

- 💬 Discord: [Join our community](https://discord.gg/vUKnuhHtfW)
- 🐛 Issues: [GitHub Issues](https://github.com/superglue-ai/superglue/issues)

[![Twitter](https://img.shields.io/twitter/follow/superglue_d?style=social)](https://twitter.com/superglue_d)

