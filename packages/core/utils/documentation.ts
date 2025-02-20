import axios from "axios";
import { getIntrospectionQuery } from "graphql";
import { NodeHtmlMarkdown } from "node-html-markdown";

export function postProcessLargeDoc(documentation: string, endpointPath: string): string {
  const MAX_DOC_LENGTH = 80000;
  const MIN_INITIAL_CHUNK = 20000;
  const MAX_INITIAL_CHUNK = 40000;
  const CONTEXT_SIZE = 10000;
  const CONTEXT_SEPARATOR = "\n\n";

  if (documentation.length <= MAX_DOC_LENGTH) {
    return documentation;
  }

  // Extract search term from endpoint
  const searchTerm = endpointPath ? endpointPath.startsWith('/') ? endpointPath.slice(1).toLowerCase() : endpointPath.toLowerCase() : endpointPath;
  const docLower = documentation.toLowerCase();

  // Find all occurrences of the search term
  const positions: number[] = [];
  let pos = docLower.indexOf(searchTerm);
  while (pos !== -1) {
    positions.push(pos);
    pos = docLower.indexOf(searchTerm, pos + 1);
  }

  // If no occurrences found or no endpoint provided, return max doc length
  if (positions.length === 0 || !endpointPath) {
    return documentation.slice(0, MAX_DOC_LENGTH);
  }

  // Calculate non-overlapping context regions
  type Region = { start: number; end: number };
  const regions: Region[] = [];
  
  for (const pos of positions) {
    const start = Math.max(0, pos - CONTEXT_SIZE);
    const end = Math.min(documentation.length, pos + CONTEXT_SIZE);
    // Check if this region overlaps with the last one
    const lastRegion = regions[regions.length - 1];
    if (lastRegion && start <= lastRegion.end) {
      // Merge overlapping regions
      lastRegion.end = Math.max(lastRegion.end, end);
    } else {
      regions.push({ start, end });
    }
  }

  // Calculate total space needed for non-overlapping contexts
  const totalContextSpace = regions.reduce((sum, region) => 
    sum + (region.end - region.start), 0);
  const separatorSpace = regions.length * CONTEXT_SEPARATOR.length;

  // If contexts overlap significantly, we might have more space for initial chunk
  const availableForInitial = MAX_DOC_LENGTH - (totalContextSpace + separatorSpace);
  
  // Use up to MAX_INITIAL_CHUNK if we have space due to overlapping contexts
  const initialChunkSize = Math.max(
    MIN_INITIAL_CHUNK,
    Math.min(availableForInitial, MAX_INITIAL_CHUNK)
  );

  let finalDoc = documentation.slice(0, initialChunkSize);
  let remainingLength = MAX_DOC_LENGTH - finalDoc.length;

  // Add context for each non-overlapping region
  for (const region of regions) {
    if (remainingLength <= 0) break;

    const context = documentation.slice(region.start, region.end);
    
    // Only add context if it's not already included and we have space
    if (!finalDoc.includes(context) && (context.length + CONTEXT_SEPARATOR.length) <= remainingLength) {
      finalDoc += CONTEXT_SEPARATOR + context;
      remainingLength -= (context.length + CONTEXT_SEPARATOR.length);
    }
  }

  return finalDoc;
}

export async function getDocumentation(documentationUrl: string, headers: Record<string, string>, queryParams: Record<string, string>, apiEndpoint?: string): Promise<string> {
    const docMaxLength = 80000;
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
      console.error(`Failed to fetch documentation from ${documentationUrl}:`, error?.message);
    }

    if(documentation.length > docMaxLength) {
      documentation = postProcessLargeDoc(documentation, apiEndpoint || '');
    }

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