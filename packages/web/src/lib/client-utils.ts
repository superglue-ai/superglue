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

export const parseCredentialsHelper = (simpleCreds: string) : Record<string, any> => {
  const creds = simpleCreds?.trim() || ""
  if(!creds) {
    return {}
  }

  if (creds.startsWith('{')) {
    return JSON.parse(creds)
  }

  if(creds.startsWith('Bearer ')) {
    return { apiKey: creds.replace('Bearer ', '') }
  }

  if(creds.startsWith('Basic ')) {
    return { apiKey: creds.replace('Basic ', '') }
  }

  return { apiKey: creds }
}
