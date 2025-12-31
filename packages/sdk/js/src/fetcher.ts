let baseUrl = "https://api.superglue.ai/v1";
let apiKey = "";

export const configure = (config: { baseUrl?: string; apiKey: string }) => {
  if (config.baseUrl) baseUrl = config.baseUrl;
  apiKey = config.apiKey;
};

export const customFetch = async <T>(url: string, options: RequestInit): Promise<T> => {
  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const data = await response.json();

  return { data, status: response.status, headers: response.headers } as T;
};
