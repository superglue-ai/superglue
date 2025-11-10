import { SuperglueClient } from "@superglue/client";

export class ExtendedSuperglueClient extends SuperglueClient {
  private async graphQL<T = any>(query: string, variables?: any): Promise<T> {
    const endpoint = (this as any)["endpoint"] as string;
    const apiKey = (this as any)["apiKey"] as string;
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`GraphQL ${res.status}`);
    const json = await res.json();
    if (json.errors && json.errors.length)
      throw new Error(json.errors[0]?.message || "GraphQL error");
    return json.data as T;
  }

  async cacheOauthClientCredentials(args: {
    clientCredentialsUid: string;
    clientId: string;
    clientSecret: string;
  }): Promise<boolean> {
    const data = await this.graphQL<{ cacheOauthClientCredentials: boolean }>(
      `
            mutation CacheOauthClientCredentials($clientCredentialsUid: String!, $clientId: String!, $clientSecret: String!) {
                cacheOauthClientCredentials(clientCredentialsUid: $clientCredentialsUid, clientId: $clientId, clientSecret: $clientSecret)
            }
        `,
      args,
    );
    return Boolean(data?.cacheOauthClientCredentials);
  }

  async getOAuthClientCredentials(args: {
    templateId?: string;
    clientCredentialsUid?: string;
  }): Promise<{ client_id: string; client_secret: string }> {
    const data = await this.graphQL<{
      getOAuthClientCredentials: { client_id: string; client_secret: string };
    }>(
      `
            mutation GetOAuthClientCredentials($templateId: ID, $clientCredentialsUid: String) {
                getOAuthClientCredentials(templateId: $templateId, clientCredentialsUid: $clientCredentialsUid) {
                    client_id
                    client_secret
                }
            }
        `,
      args,
    );
    return data.getOAuthClientCredentials;
  }

  async searchIntegrationDocumentation(
    integrationId: string,
    keywords: string,
  ): Promise<string> {
    const data = await this.graphQL<{ searchIntegrationDocumentation: string }>(
      `
            query SearchIntegrationDocumentation($integrationId: ID!, $keywords: String!) {
                searchIntegrationDocumentation(integrationId: $integrationId, keywords: $keywords)
            }
        `,
      { integrationId, keywords },
    );
    return data.searchIntegrationDocumentation;
  }

  async generateInstructions(integrations: any[]): Promise<string[]> {
    const data = await this.graphQL<{ generateInstructions: string[] }>(
      `
            query GenerateInstructions($integrations: [IntegrationInput!]!) {
                generateInstructions(integrations: $integrations)
            }
        `,
      { integrations },
    );

    const instructions = data.generateInstructions;
    if (instructions.length === 1 && instructions[0].startsWith("Error:")) {
      throw new Error(instructions[0].replace("Error: ", ""));
    }
    return instructions;
  }
}
