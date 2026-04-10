/**
 * String sanitization utilities
 */

/**
 * Remove unpaired Unicode surrogates (U+D800 to U+DFFF) that cause JSON parsing errors
 * when sent to external APIs like Vercel AI. These are invalid UTF-8 sequences.
 */
export function sanitizeUnpairedSurrogates(str: string): string {
  return str.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "");
}

/**
 * Convert Basic Auth credentials to Base64 if not already encoded
 */
export function convertBasicAuthToBase64(headerValue: string): string {
  if (!headerValue || !headerValue.startsWith("Basic ")) return headerValue;
  const credentials = headerValue.substring("Basic ".length).trim();
  const seemsEncoded = /^[A-Za-z0-9+/=]+$/.test(credentials);

  if (!seemsEncoded) {
    const base64Credentials = Buffer.from(credentials).toString("base64");
    return `Basic ${base64Credentials}`;
  }
  return headerValue;
}

export function escapeSqlLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
