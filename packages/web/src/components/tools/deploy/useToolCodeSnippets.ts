import { useConfig } from "@/src/app/config-context";
import { useMemo } from "react";
import { safeStringify } from "@superglue/shared";

export interface ToolCodeSnippets {
  webhookUrl: string;
  webhookCurl: string;
  typescriptCode: string;
  pythonCode: string;
  curlCommand: string;
  outgoingWebhookExample: string;
  mcpConfig: string;
}

export function useToolCodeSnippets(
  toolId: string,
  payload: Record<string, any> = {},
): ToolCodeSnippets {
  const config = useConfig();

  return useMemo(() => {
    const webhookUrl = `${config.apiEndpoint}/v1/hooks/${toolId}?token=YOUR_API_KEY`;

    const webhookCurl = `curl -X POST "${config.apiEndpoint}/v1/hooks/${toolId}?token=YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${safeStringify(payload, 2)}'`;

    const typescriptCode = `import { configure, runTool } from '@superglue/client';

configure({
  apiKey: "<YOUR_SUPERGLUE_API_KEY>",
  baseUrl: "${config.apiEndpoint}/v1"
});

async function main() {
  const result = await runTool("${toolId}", {
    inputs: ${safeStringify(payload, 2)}
  });
  console.log(result.data);
}

main();`;

    const pythonCode = `from superglue_client import SuperglueClient
from superglue_client.api.tools import run_tool
from superglue_client.models import RunRequest, RunRequestInputs

client = SuperglueClient(
    base_url="${config.apiEndpoint}/v1",
    token="<YOUR_SUPERGLUE_API_KEY>"
)

inputs = RunRequestInputs.from_dict(${safeStringify(payload, 2)})

with client as client:
    result = run_tool.sync(
        "${toolId}",
        client=client,
        body=RunRequest(inputs=inputs)
    )
    print(result)`;

    const curlCommand = `curl -X POST "${config.apiEndpoint}/v1/tools/${toolId}/run" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_SUPERGLUE_API_KEY>" \\
  -d '${safeStringify({ inputs: payload })}'`;

    const outgoingWebhookExample = `import { configure, runTool } from '@superglue/client';

configure({
  apiKey: "<YOUR_SUPERGLUE_API_KEY>",
  baseUrl: "${config.apiEndpoint}/v1"
});

await runTool("${toolId}", {
  inputs: ${safeStringify(payload, 2)},
  options: {
    webhookUrl: "https://your-app.com/webhook"
  }
});`;

    const mcpConfig = `{
  "mcpServers": {
    "superglue": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "${config.apiEndpoint.includes("https://api.superglue") ? "https://mcp.superglue.ai" : `${config.superglueEndpoint}/mcp`}",
        "--header",
        "Authorization:\${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "Bearer <YOUR_SUPERGLUE_API_KEY>"
      }
    }
  }
}`;

    return {
      webhookUrl,
      webhookCurl,
      typescriptCode,
      pythonCode,
      curlCommand,
      outgoingWebhookExample,
      mcpConfig,
    };
  }, [config.apiEndpoint, config.superglueEndpoint, toolId, payload]);
}
