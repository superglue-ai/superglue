import axios from "axios";
import { getIntrospectionQuery } from "graphql";
import { NodeHtmlMarkdown } from "node-html-markdown";

export async function getDocumentation(documentationUrl: string, headers: Record<string, string>, queryParams: Record<string, string>): Promise<string> {
    if(!documentationUrl) {
      return "";
    }
    let documentation = "";
    // If the documentation is not a URL, return it as is
    if(!documentationUrl.startsWith("http")) {
      return documentationUrl;
    }
    try {
      const response = await axios.get(documentationUrl);
      const docData = response.data;

      if (String(docData).toLowerCase().slice(0, 200).includes("<html")) {
        documentation = NodeHtmlMarkdown.translate(docData);
      }
      if(!documentation && docData) {
        documentation = typeof docData === 'object' ? JSON.stringify(docData) : String(docData);
      }

      // If the documentation contains GraphQL, fetch the schema and add it to the documentation
        if(documentationUrl.includes("graphql") || documentation.toLowerCase().includes("graphql")) {
          const graphqlDocumentation = await getGraphQLSchema(documentationUrl, headers, queryParams);
          if(graphqlDocumentation) {
            documentation = [JSON.stringify(graphqlDocumentation), documentation].join("\n\n"); 
          }
      }
    } catch (error) {
      console.error(`Failed to fetch documentation from ${documentationUrl}:`, error);
    }


    // If the documentation contains GraphQL, fetch the schema and add it to the documentation
    return documentation;
  }
  
  async function getGraphQLSchema(documentationUrl: string, headers?: Record<string, string>, queryParams?: Record<string, string>) {
    // The standard introspection query
    const introspectionQuery = getIntrospectionQuery();
  
    try {
      const response = await axios.post(
        documentationUrl,
        {
          query: introspectionQuery,
          operationName: 'IntrospectionQuery'
        },
        { headers, params: queryParams }
      );
  
      if (response.data.errors) {
        throw new Error(`GraphQL Introspection failed: ${response.data.errors[0].message}`);
      }
  
      return response.data.data.__schema;
    } catch (error) {
      console.error('Failed to fetch GraphQL schema:', error);
      return null;
    }
  }