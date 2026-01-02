import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialEncryption } from "./encryption.js";

describe("CredentialEncryption", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("when MASTER_ENCRYPTION_KEY is not set", () => {
    beforeEach(() => {
      delete process.env.MASTER_ENCRYPTION_KEY;
    });

    it("should return credentials unchanged", () => {
      const encryption = new CredentialEncryption();
      const credentials = {
        apiKey: "sk_test_123",
        secret: "my-secret-value",
      };

      const encrypted = encryption.encrypt(credentials);
      expect(encrypted).toEqual(credentials);

      const decrypted = encryption.decrypt(encrypted);
      expect(decrypted).toEqual(credentials);
    });

    it("should handle null/undefined credentials", () => {
      const encryption = new CredentialEncryption();

      expect(encryption.encrypt(null)).toBeNull();
      expect(encryption.encrypt(undefined)).toBeUndefined();
      expect(encryption.decrypt(null)).toBeNull();
      expect(encryption.decrypt(undefined)).toBeUndefined();
    });
  });

  describe("when MASTER_ENCRYPTION_KEY is set", () => {
    beforeEach(() => {
      process.env.MASTER_ENCRYPTION_KEY = "test-master-key-12345";
    });

    it("should encrypt and decrypt credentials", () => {
      const encryption = new CredentialEncryption();
      const credentials = {
        apiKey: "sk_test_123",
        secret: "my-secret-value",
        token: "bearer-token-xyz",
      };

      const encrypted = encryption.encrypt(credentials);

      // Verify values are encrypted
      expect(encrypted.apiKey).not.toEqual(credentials.apiKey);
      expect(encrypted.apiKey).toMatch(/^enc:/);
      expect(encrypted.secret).not.toEqual(credentials.secret);
      expect(encrypted.secret).toMatch(/^enc:/);
      expect(encrypted.token).not.toEqual(credentials.token);
      expect(encrypted.token).toMatch(/^enc:/);

      // Verify format is enc:iv:encryptedData
      const parts = encrypted.apiKey.split(":");
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe("enc");
      expect(parts[1]).toHaveLength(32); // 16 bytes as hex = 32 chars

      // Verify decryption works
      const decrypted = encryption.decrypt(encrypted);
      expect(decrypted).toEqual(credentials);
    });

    it("should handle empty values in credentials", () => {
      const encryption = new CredentialEncryption();
      const credentials = {
        apiKey: "sk_test_123",
        emptyValue: "",
        nullValue: null as any,
        undefinedValue: undefined as any,
      };

      const encrypted = encryption.encrypt(credentials);
      expect(encrypted.apiKey).toMatch(/^enc:/);
      expect(encrypted.emptyValue).toBe("");
      expect(encrypted.nullValue).toBeNull();
      expect(encrypted.undefinedValue).toBeUndefined();

      const decrypted = encryption.decrypt(encrypted);
      expect(decrypted.apiKey).toBe("sk_test_123");
      expect(decrypted.emptyValue).toBe("");
    });

    it("should handle mixed encrypted and plain values", () => {
      const encryption = new CredentialEncryption();

      // Test that plain values pass through unchanged
      const plainCredentials = {
        plain: "plain-text-value",
        alsoPlain: "another-plain-value",
      };

      const result = encryption.decrypt(plainCredentials);
      expect(result.plain).toBe("plain-text-value");
      expect(result.alsoPlain).toBe("another-plain-value");

      // Test that invalid encrypted format throws
      const invalidCredentials = {
        apiKey: "enc:invalidformat", // Missing third part
      };
      expect(() => encryption.decrypt(invalidCredentials)).toThrow("Failed to decrypt credentials");
    });

    it("should use different IVs for same value", () => {
      const encryption = new CredentialEncryption();
      const credentials1 = { apiKey: "same-value" };
      const credentials2 = { apiKey: "same-value" };

      const encrypted1 = encryption.encrypt(credentials1);
      const encrypted2 = encryption.encrypt(credentials2);

      // Same plaintext should produce different ciphertext due to random IV
      expect(encrypted1.apiKey).not.toEqual(encrypted2.apiKey);

      // Extract IVs and verify they're different
      const iv1 = encrypted1.apiKey.split(":")[1];
      const iv2 = encrypted2.apiKey.split(":")[1];
      expect(iv1).not.toEqual(iv2);

      // But both should decrypt to the same value
      expect(encryption.decrypt(encrypted1)).toEqual(credentials1);
      expect(encryption.decrypt(encrypted2)).toEqual(credentials2);
    });

    it("should throw error on invalid encrypted data", () => {
      const encryption = new CredentialEncryption();
      const invalidCredentials = {
        apiKey: "enc:invalidformat",
      };

      expect(() => encryption.decrypt(invalidCredentials)).toThrow("Failed to decrypt credentials");
    });

    it("should fail to decrypt with different master key", () => {
      // Encrypt with one key
      process.env.MASTER_ENCRYPTION_KEY = "key-1";
      const encryption1 = new CredentialEncryption();
      const credentials = { apiKey: "sk_test_123" };
      const encrypted = encryption1.encrypt(credentials);

      // Try to decrypt with different key
      process.env.MASTER_ENCRYPTION_KEY = "key-2";
      const encryption2 = new CredentialEncryption();

      expect(() => encryption2.decrypt(encrypted)).toThrow("Failed to decrypt credentials");
    });
  });

  describe("isEnabled", () => {
    it("should return false when no master key", () => {
      delete process.env.MASTER_ENCRYPTION_KEY;
      const encryption = new CredentialEncryption();
      expect(encryption.isEnabled()).toBe(false);
    });

    it("should return true when master key is set", () => {
      process.env.MASTER_ENCRYPTION_KEY = "test-key";
      const encryption = new CredentialEncryption();
      expect(encryption.isEnabled()).toBe(true);
    });
  });
});
