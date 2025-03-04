import axios from "axios";
import { getIntrospectionQuery } from "graphql";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { DOCUMENTATION_MAX_LENGTH } from "../config.js";

export function extractOpenApiUrl(html: string): string | null {
  try {
    // First try to match based on swagger settings
    const settingsMatch = html.match(/<script[^>]*id=["']swagger-settings["'][^>]*>([\s\S]*?)<\/script>/i);
    if (settingsMatch && settingsMatch[1]) {

      const settingsContent = settingsMatch[1].trim();
      const settings = JSON.parse(settingsContent);
      
      if (settings.url) {
        return settings.url;
      }
    }
    
    // Fallback: look for JSON with a url property pointing to openapi.json
    const jsonMatch = html.match(/({[^}]*"url"[^}]*"[^"]*openapi\.json[^}]*})/i);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const jsonObj = JSON.parse(jsonMatch[1]);
        if (jsonObj.url) {
          return jsonObj.url;
        }
      } catch (e) {
        // Continue
      }
    }
    
    // find direct references to openapi.json URLs
    const openApiUrlMatch = html.match(/["']((?:https?:\/\/)?[^"']*openapi\.json)["']/i);
    if (openApiUrlMatch && openApiUrlMatch[1]) {
      return openApiUrlMatch[1];
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to extract OpenAPI URL:', error?.message);
    return null;
  }
}

async function getOpenApiJsonFromUrl(openApiUrl: string, documentationUrl: string): Promise<string | null> {
  try {
    // Determine the full URL based on whether it's relative or absolute
    const fullOpenApiUrl = openApiUrl.startsWith('http') 
      ? openApiUrl 
      : new URL(openApiUrl, documentationUrl).toString();

    const openApiResponse = await axios.get(fullOpenApiUrl);
    const openApiData = openApiResponse.data;
    if (openApiData) {
      const openApiJson = typeof openApiData === 'object' 
        ? openApiData 
        : JSON.parse(openApiData);

      if (openApiJson && !openApiJson.openapi) {
        console.warn('Fetched JSON does not appear to be a valid OpenAPI document (missing "openapi" key)');
      }
      return openApiJson;
    }
  } catch (error) {
    console.warn(`Failed to fetch OpenAPI JSON from ${openApiUrl}:`, error?.message);
  }
  return null;
}

export function postProcessLargeDoc(documentation: string, endpointPath: string): string {
  const MIN_INITIAL_CHUNK = 20000;
  const MAX_INITIAL_CHUNK = 40000;
  const CONTEXT_SIZE = 10000;
  const CONTEXT_SEPARATOR = "\n\n";
  const MIN_SEARCH_TERM_LENGTH = 3;

  if (documentation.length <= DOCUMENTATION_MAX_LENGTH) {
    return documentation;
  }

  // Extract search term from endpoint
  let searchTerm = endpointPath ? endpointPath.startsWith('/') ? endpointPath.slice(1).toLowerCase() : endpointPath.toLowerCase() : endpointPath;
  searchTerm = searchTerm ? String(searchTerm).trim() : '';
  const docLower = documentation.toLowerCase();

  if (!endpointPath || searchTerm.length < MIN_SEARCH_TERM_LENGTH) {
    return documentation.slice(0, DOCUMENTATION_MAX_LENGTH);
  }

  // Find all occurrences of the search term
  const positions: number[] = [];

  // Fix the authorization search to properly find all relevant authorization terms
  let authPosSecuritySchemes = docLower.indexOf("securityschemes");
  if (authPosSecuritySchemes !== -1) {
    positions.push(authPosSecuritySchemes);
  }
  let authPosAuthorization = docLower.indexOf("authorization");
  if (authPosAuthorization !== -1) {
    positions.push(authPosAuthorization);
  }

  let pos = docLower.indexOf(searchTerm);	
  while (pos !== -1) {
    positions.push(pos);
    pos = docLower.indexOf(searchTerm, pos + 1);
  }

  // If no occurrences found return max doc length
  if (positions.length === 0) {
    return documentation.slice(0, DOCUMENTATION_MAX_LENGTH);
  }

  // Calculate non-overlapping context regions
  type Region = { start: number; end: number };
  const regions: Region[] = [];
  // Sort positions to ensure we process them in order from start to end of document
  positions.sort((a, b) => a - b);
  
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
  const availableForInitial = DOCUMENTATION_MAX_LENGTH - (totalContextSpace + separatorSpace);
  
  // Use up to MAX_INITIAL_CHUNK if we have space due to overlapping contexts
  const initialChunkSize = Math.max(
    MIN_INITIAL_CHUNK,
    Math.min(availableForInitial, MAX_INITIAL_CHUNK)
  );

  let finalDoc = documentation.slice(0, initialChunkSize);
  let remainingLength = DOCUMENTATION_MAX_LENGTH - finalDoc.length;

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
      const docString = typeof docData === 'string' ? docData : JSON.stringify(docData);

      if (docString.toLowerCase().slice(0, 200).includes("<html")) {
        documentation = NodeHtmlMarkdown.translate(docString);
        
        // TODO: maybe do this irrespective of the html tag presence?
        const openApiUrl = extractOpenApiUrl(docString);
        if (openApiUrl) {
          const openApiJson = await getOpenApiJsonFromUrl(openApiUrl, documentationUrl);
          if (openApiJson) {
            documentation = [JSON.stringify(openApiJson), documentation].join("\n\n");
          }
        }

      }
      if(!documentation && docData) {
        documentation = typeof docData === 'object' ? JSON.stringify(docData) : docString;
      }

      // If the documentation contains GraphQL, fetch the schema and add it to the documentation
      if(documentationUrl.includes("graphql") || documentation.toLowerCase().includes("graphql")) {
        const graphqlDocumentation = await getGraphQLSchema(documentationUrl, headers, queryParams);
        if(graphqlDocumentation) {
          documentation = [JSON.stringify(graphqlDocumentation), documentation].join("\n\n"); 
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch documentation from ${documentationUrl}:`, error?.message);
    }

    if(documentation.length > DOCUMENTATION_MAX_LENGTH) {
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