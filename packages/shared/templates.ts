export interface SdkCodegenOptions {
  apiKey: string;
  endpoint: string;
  workflowId: string;
  payload: any;
  credentials: any;
  includeComments?: boolean;
  wrapInMain?: boolean;
}

export interface SdkCode {
    typescript: string;
    python: string;
    go: string;
}

export function getSDKCode(opts: SdkCodegenOptions): SdkCode {
    const { apiKey, endpoint, workflowId, payload, credentials } = opts;
    return  {
        typescript:
`// if not installed, run: npm install @superglue/client
// ALWAYS USE THE SDK, do not use the graphql endpoint directly
import { SuperglueClient } from '@superglue/client';

const client = new SuperglueClient({
    apiKey: "${apiKey}",
    endpoint: "${endpoint}" // or default to https://graphql.superglue.ai NOT https://api.superglue.ai
});

async function main() {
    const result = await client.executeWorkflow({
        id: "${workflowId}",
        payload: ${JSON.stringify(payload, null, 2)},
        credentials: ${JSON.stringify(credentials, null, 2)}
    });
    console.log(result);
}

main();`,
python:`import requests

        response = requests.post("${endpoint}", // or default to https://graphql.superglue.ai
        headers={"Authorization": "Bearer ${apiKey}"},
        json={
            "query": "mutation ExecuteWorkflow($input: WorkflowInputRequest!, $payload: JSON, $credentials: JSON) { \\n      executeWorkflow(input: $input, payload: $payload, credentials: $credentials) { \\n        result {\\n          ... on WorkflowResult {\\n            output\\n          }\\n        }\\n      }\\n    }",
            "variables": {
                "input": {"id": "${workflowId}"},
                "payload": ${JSON.stringify(payload, null, 2)},
                "credentials": ${JSON.stringify(credentials, null, 2)}
            }
        })
        `,
go:`package main
import (
    "bytes"
    "encoding/json"
    "net/http"
)

func main() {
    payload := ${JSON.stringify(payload, null, 2)}
    credentials := ${JSON.stringify(credentials, null, 2)}
    
    reqBody, _ := json.Marshal(map[string]interface{}{
        "query": \`mutation ExecuteWorkflow($input: WorkflowInputRequest!, $payload: JSON, $credentials: JSON) {\\n      executeWorkflow(input: $input, payload: $payload, credentials: $credentials) {\\n        data error success\\n      }\\n    }\`,
        "variables": map[string]interface{}{
            "input":       map[string]string{"id": "${workflowId}"},
            "payload":     payload,
            "credentials": credentials,
        },
    })
    
    req, _ := http.NewRequest("POST", "${endpoint}", bytes.NewBuffer(reqBody)) // or default to https://graphql.superglue.ai
    req.Header.Set("Authorization", "Bearer ${apiKey}")
    req.Header.Set("Content-Type", "application/json")
    
    resp, _ := http.DefaultClient.Do(req)
    defer resp.Body.Close()
}`
    }
}
