import crypto from "node:crypto";

/**
 * Encrypt API key for CLI OAuth state.
 * Uses AES-256-GCM for authenticated encryption.
 * Key is derived from MASTER_ENCRYPTION_KEY + systemId to ensure:
 * 1. The encrypted value cannot be decrypted without server-side secret
 * 2. The encrypted value is only valid for that specific system
 *
 * @param secret - Server-side secret (MASTER_ENCRYPTION_KEY)
 */
export function encryptCliApiKey(apiKey: string, systemId: string, secret: string): string {
  if (!secret) {
    throw new Error("Server secret required for CLI OAuth encryption");
  }
  const key = crypto.createHash("sha256").update(`${secret}:cli-oauth:${systemId}`).digest();
  const iv = crypto.randomBytes(12); // GCM recommends 12-byte IV
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(apiKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${encrypted}:${authTag}`;
}

/**
 * Decrypt API key from CLI OAuth state.
 * Returns null if decryption or authentication fails.
 *
 * @param secret - Server-side secret (MASTER_ENCRYPTION_KEY)
 */
export function decryptCliApiKey(
  encrypted: string,
  systemId: string,
  secret: string,
): string | null {
  if (!secret) {
    return null;
  }
  try {
    const [ivHex, encryptedHex, authTagHex] = encrypted.split(":");
    if (!ivHex || !encryptedHex || !authTagHex) return null;
    const key = crypto.createHash("sha256").update(`${secret}:cli-oauth:${systemId}`).digest();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return null;
  }
}
