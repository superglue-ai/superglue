import { Integration } from "@superglue/client";

export const inputErrorStyles = "!border-destructive !border-[1px] focus:!ring-0 focus:!ring-offset-0"

export const isJsonEmpty = (inputJson: string): boolean => {
  try {
    if (!inputJson) return true
    const parsedJson = JSON.parse(inputJson)
    return Object.keys(parsedJson).length === 0
  } catch (error) {
    // If invalid JSON, we consider it empty
    return true
  }
}

export const findArraysOfObjects = (obj: any): Record<string, any[]> => {
  const arrays: Record<string, any[]> = {};

  const traverse = (value: any, path: string = '') => {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      arrays[path] = value;
    }

    if (typeof value === 'object' && value !== null) {
      Object.entries(value).forEach(([key, val]) => {
        traverse(val, `${path ? `${path}.` : ''}${key}`);
      });
    }
  };
  traverse(obj);

  if (Object.keys(arrays).length === 0) {
    if (Object.keys(obj).length === 1) {
      const [key, value] = Object.entries(obj)[0];
      return { [key]: [value] };
    }
    return { response: [obj] };
  }
  return arrays;
};

export const parseCredentialsHelper = (simpleCreds: string): Record<string, string> => {
  try {
    const creds = simpleCreds?.trim() || ""
    if (!creds) {
      return {}
    }

    if (creds.startsWith('{')) {
      return JSON.parse(creds)
    }

    if (creds.startsWith('Bearer ')) {
      return { token: creds.replace('Bearer ', '') }
    }

    if (creds.startsWith('Basic ')) {
      return { token: creds.replace('Basic ', '') }
    }

    return { token: creds }
  } catch (error) {
    return {}
  }
}

export const splitUrl = (url: string) => {
  if (!url) {
    return {
      urlHost: '',
      urlPath: ''
    }
  }
  
  // Find the position after the protocol (://)
  const protocolEnd = url.indexOf('://');  
  // Find the first slash after the protocol
  const firstSlashAfterProtocol = url.indexOf('/', protocolEnd + 3);
  
  if (firstSlashAfterProtocol === -1) {
    // No path, entire URL is the host
    return {
      urlHost: url,
      urlPath: ''
    }
  }
  
  // Split at the first slash after protocol
  return {
    urlHost: url.substring(0, firstSlashAfterProtocol),
    urlPath: url.substring(firstSlashAfterProtocol)
  }
}

export function needsUIToTriggerDocFetch(newIntegration: Integration, oldIntegration: Integration | null): boolean {
  // If documentation was manually provided, no fetch needed.
  if (newIntegration.documentation && newIntegration.documentation.trim()) {
    return false;
  }

  // If it's a new integration with a doc URL, fetch is needed.
  if (!oldIntegration) {
    return true;
  }

  // If any of the relevant URLs have changed, fetch is needed.
  if (newIntegration.urlHost !== oldIntegration.urlHost ||
    newIntegration.urlPath !== oldIntegration.urlPath ||
    newIntegration.documentationUrl !== oldIntegration.documentationUrl) {
    return true;
  }

  return false;
}
