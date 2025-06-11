import { cleanUrl } from "./utils"

export const inputErrorStyles = "!border-destructive !border-[1px] focus:!ring-0 focus:!ring-offset-0"

export const isJsonEmpty = (inputJson: string) : boolean => {
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
    if(Object.keys(obj).length === 1) {
      const [key, value] = Object.entries(obj)[0];
      return {[key]: [value]};
    }
    return {response: [obj]};
  }
  return arrays;
};

export const parseCredentialsHelper = (simpleCreds: string) : Record<string, string> => {
  try {
  const creds = simpleCreds?.trim() || ""
  if(!creds) {
    return {}
  }

  if (creds.startsWith('{')) {
    return JSON.parse(creds)
  }

  if(creds.startsWith('Bearer ')) {
    return { token: creds.replace('Bearer ', '') }
  }

  if(creds.startsWith('Basic ')) {
    return { token: creds.replace('Basic ', '') }
  }

    return { token: creds }
  } catch (error) {
    return {}
  }
}

export const removeNullUndefined = (obj: any): any => {
  if (Array.isArray(obj)) {
    // Filter out null/undefined values after mapping
    return obj
      .map(removeNullUndefined)
      .filter(v => v !== null && v !== undefined);
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj: Record<string, any> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = removeNullUndefined(obj[key]);
        // Only add the key back if the processed value is not null/undefined
        if (value !== null && value !== undefined) {
          newObj[key] = value;
        }
      }
    }
    // Return null if the object becomes empty after cleaning,
    // or you could return {} depending on desired behavior.
    // Let's return {} for now to avoid removing empty objects entirely.
    return newObj;
  }
  // Return primitives, null, or undefined as is
  return obj;
};

export const splitUrl = (url: string) => {
  if (!url) {
    return {
      urlHost: '',
      urlPath: ''
    }
  }
  const urlObj = cleanUrl(url);
  return {
    urlHost: urlObj.protocol + '//' + urlObj.host,
    urlPath: urlObj.pathname === '/' ? '' : urlObj.pathname
  }   
}

export function flattenWorkflowCredentials(systems: { id: string; credentials: Record<string, string> }[]): Record<string, string> {
  return systems.reduce((acc, sys) => {
    return {
      ...acc,
      ...Object.entries(sys.credentials || {}).reduce(
        (obj, [name, value]) => ({ ...obj, [`${sys.id}_${name}`]: value }),
        {}
      ),
    }
  }, {});
}
