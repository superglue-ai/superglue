import type { ServiceMetadata } from "@superglue/shared";
import { generateText } from "ai";
import { logMessage } from "../../../packages/core/utils/logs.js";
import type { IntegrationConfig, ToolConfig } from "../../tool-evals/types.js";

const MAX_CODE_SIZE = 10000;

export class LlmCodeGenerator {
  constructor(
    private model: any,
    private metadata: ServiceMetadata,
  ) {}

  async generate(tool: ToolConfig, integrations: IntegrationConfig[]): Promise<string> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.generatePrompt(tool, integrations);

    logMessage("info", `Generating code for tool ${tool.id}`, this.metadata);

    const response = await generateText({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      // temperature: 0.1,
    });

    const code = this.extractCode(response.text);
    if (!code) {
      throw new Error("No valid JavaScript code found in LLM response");
    }

    return this.truncateCode(code);
  }

  private getSystemPrompt(): string {
    return `You are an expert JavaScript developer tasked with writing code to integrate with APIs.
Generate clean, working JavaScript code that fulfills the given task using the provided API integrations.
The code should be self-contained and return the requested data.
Always wrap your code in <<CODE>> and <</CODE>> tags (note the closing tag has a forward slash).`;
  }

  private generatePrompt(tool: ToolConfig, integrations: IntegrationConfig[]): string {
    const integrationDetails = integrations
      .map((integration) => {
        const credentialEntries = Object.entries(integration.credentials || {});
        const credentialPairs = credentialEntries.map(([key, value]) => {
          if (!value || value === "") {
            logMessage(
              "warn",
              `Missing credential ${key} for integration ${integration.id}`,
              this.metadata,
            );
            return `    const ${key} = "MISSING_CREDENTIAL";`;
          }
          return `    const ${key} = "${value}";`;
        });

        const codeSnippet = `// ${integration.name} Configuration
const ${integration.id}_config = {
    baseUrl: "${integration.urlHost}"
};
${credentialPairs.join("\n")};`;

        return `Integration: ${integration.name}
Base URL: ${integration.urlHost}

Ready-to-use configuration:
${codeSnippet}`;
      })
      .join("\n\n---\n\n");

    return `Task: ${tool.instruction}

Available Integrations:
${integrationDetails}

Input Payload (already defined as 'payload'):
const payload = ${JSON.stringify(tool.payload || {}, null, 2)};

INSTRUCTIONS:
Write JavaScript code that fulfills the task above. The code should:
1. Use the EXACT configuration values shown above (copy them directly)
2. Make API calls using fetch()
3. Process the responses as needed
4. Return the final result matching the requested format
5. Wrap all code between <<CODE>> and <</CODE>> tags (note the / in the closing tag)

CRITICAL - Use the EXACT values shown above. For example:
- If you see: const secret_key = "sk_test_123"; then use EXACTLY "sk_test_123"
- DO NOT write <<secret_key>> or \${secret_key} or any template syntax
- Copy the credential values EXACTLY as shown

Example structure:
<<CODE>>
async function executeTask() {
    // Copy the configuration exactly as shown above
    const stripe_config = {
        baseUrl: "https://api.stripe.com"
    };
    const secret_key = "sk_test_123"; // Define credentials OUTSIDE the config object
    
    const response = await fetch(stripe_config.baseUrl + '/v1/subscriptions', {
        headers: {
            'Authorization': 'Bearer ' + secret_key,
            'Content-Type': 'application/json'
        }
    });
    
    const data = await response.json();
    // Process data and return result
    return { result: data };
}
return executeTask();
<</CODE>>`;
  }

  private extractCode(response: string): string | null {
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith("`") && cleanResponse.endsWith("`")) {
      cleanResponse = cleanResponse.slice(1, -1).trim();
    }

    // Try with proper closing tag
    let codeMatch = cleanResponse.match(/<<CODE>>([\s\S]*?)<<\/CODE>>/);
    if (codeMatch) {
      return codeMatch[1].trim();
    }

    // Try with <<CODE>> as both opening and closing
    codeMatch = cleanResponse.match(/<<CODE>>([\s\S]*?)<<CODE>>/);
    if (codeMatch) {
      return codeMatch[1].trim();
    }

    // Try ```javascript blocks
    const jsMatch = cleanResponse.match(/```(?:javascript|js)?\n?([\s\S]*?)```/);
    if (jsMatch) {
      return jsMatch[1].trim();
    }

    // Last resort: if response looks like code
    if (cleanResponse.includes("fetch(") || cleanResponse.includes("async function")) {
      cleanResponse = cleanResponse
        .replace(/^<<CODE>>/, "")
        .replace(/<<CODE>>$/, "")
        .trim();
      return cleanResponse;
    }

    return null;
  }

  private truncateCode(code: string): string {
    if (code.length > MAX_CODE_SIZE) {
      return `${code.substring(0, MAX_CODE_SIZE)}... [truncated]`;
    }
    return code;
  }
}
