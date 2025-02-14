---
title: 'Queries'
description: 'Queries are used to retrieve configs and logs.'
---

## List Operations

### listRuns
Returns a paginated list of execution runs.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    query ListRuns($limit: Int = 10, $offset: Int = 0) {
      listRuns(limit: $limit, offset: $offset) {
        items {
          id
          success
          error
          startedAt
          completedAt
          data
          config {
            ... on ApiConfig {
              id
              urlHost
              method
            }
            ... on ExtractConfig {
              id
              fileType
            }
            ... on TransformConfig {
              id
              responseSchema
            }
          }
        }
        total
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    const { items, total } = await client.listRuns(100, 0);
    console.log(`Found ${total} runs`);
    items.forEach(run => {
      console.log(`Run ${run.id}: ${run.success ? 'Success' : 'Failed'}`);
    });
    ```
  </Tab>
</Tabs>

### listApis
Returns a paginated list of API configurations.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    query ListApis($limit: Int = 10, $offset: Int = 0) {
      listApis(limit: $limit, offset: $offset) {
        items {
          id
          urlHost
          urlPath
          method
          authentication
          createdAt
          updatedAt
        }
        total
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    const { items, total } = await client.listApis(10, 0);
    console.log(`Found ${total} API configs`);
    items.forEach(config => {
      console.log(`API ${config.id}: ${config.urlHost}${config.urlPath}`);
    });
    ```
  </Tab>
</Tabs>

### listTransforms
Returns a paginated list of transform configurations.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    query ListTransforms($limit: Int = 10, $offset: Int = 0) {
      listTransforms(limit: $limit, offset: $offset) {
        items {
          id
          responseSchema
          responseMapping
          createdAt
          updatedAt
        }
        total
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    const { items, total } = await client.listTransforms(10, 0);
    console.log(`Found ${total} transform configs`);
    items.forEach(config => {
      console.log(`Transform ${config.id}`);
    });
    ```
  </Tab>
</Tabs>

### listExtracts
Returns a paginated list of extract configurations.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    query ListExtracts($limit: Int = 10, $offset: Int = 0) {
      listExtracts(limit: $limit, offset: $offset) {
        items {
          id
          urlHost
          fileType
          decompressionMethod
          createdAt
          updatedAt
        }
        total
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    const { items, total } = await client.listExtracts(10, 0);
    console.log(`Found ${total} extract configs`);
    items.forEach(config => {
      console.log(`Extract ${config.id}: ${config.fileType}`);
    });
    ```
  </Tab>
</Tabs>

## Get Operations

### getRun
Retrieves a specific execution run by ID.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    query GetRun($id: ID!) {
      getRun(id: $id) {
        id
        success
        error
        startedAt
        completedAt
        data
        config {
          id
          # Config fields vary by type
        }
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    const run = await client.getRun("run-id");
    console.log(`Run status: ${run.success ? 'Success' : 'Failed'}`);
    if (run.error) {
      console.error(`Error: ${run.error}`);
    }
    ```
  </Tab>
</Tabs>

### getApi
Retrieves a specific API configuration by ID. Returns [ApiConfig](types.md#apiconfig).

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    query GetApi($id: ID!) {
      getApi(id: $id) {
        id
        urlHost
        urlPath
        method
        headers
        queryParams
        authentication
        createdAt
        updatedAt
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    const config = await client.getApi("api-config-id");
    console.log(`API Config: ${config.urlHost}${config.urlPath}`);
    ```
  </Tab>
</Tabs>

### getTransform
Retrieves a specific transform configuration by ID. Returns [TransformConfig](types.md#transformconfig).

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    query GetTransform($id: ID!) {
      getTransform(id: $id) {
        id
        responseSchema
        responseMapping
        createdAt
        updatedAt
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    const config = await client.getTransform("transform-config-id");
    console.log(`Transform mapping: ${config.responseMapping}`);
    ```
  </Tab>
</Tabs>

### getExtract
Retrieves a specific extract configuration by ID. Returns [ExtractConfig](types.md#extractconfig).

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    query GetExtract($id: ID!) {
      getExtract(id: $id) {
        id
        urlHost
        fileType
        decompressionMethod
        createdAt
        updatedAt
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    const config = await client.getExtract("extract-config-id");
    console.log(`Extract type: ${config.fileType}`);
    ```
  </Tab>
</Tabs>

### generateSchema
Generates a JSON schema based on instructions and optional response data. Used to automatically create sensible response JSON schemas to return API data in.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    query GenerateSchema($instruction: String!, $responseData: String) {
      generateSchema(instruction: $instruction, responseData: $responseData)
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    const schema = await client.generateSchema(
      "Get me all characters with only their name",
      '[{"name": "Rick", "species": "Human"}, {"name": "Morty", "species": "Human"}]'
    );
    console.log(`Generated schema: ${schema}`);
    ```
  </Tab>
</Tabs>


See also:
- [Types Reference](types.md) for detailed type definitions
- [Overview](overview.md) for common parameters 