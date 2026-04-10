import { describe, expect, it } from "vitest";
import { rewriteUrlForTunnel } from "./tunnel-service.js";

describe("Tunnel URL Rewriting", () => {
  describe("path preservation", () => {
    it("should preserve simple path", () => {
      const result = rewriteUrlForTunnel("https://local-test.tunnel/api/users", 12345, "https");
      expect(result).toBe("http://127.0.0.1:12345/api/users");
    });

    it("should preserve nested path", () => {
      const result = rewriteUrlForTunnel(
        "https://local-test.tunnel/v1/api/books/123/chapters",
        12345,
        "https",
      );
      expect(result).toBe("http://127.0.0.1:12345/v1/api/books/123/chapters");
    });

    it("should preserve root path", () => {
      const result = rewriteUrlForTunnel("https://local-test.tunnel/", 12345, "https");
      expect(result).toBe("http://127.0.0.1:12345/");
    });

    it("should handle URL without trailing slash", () => {
      const result = rewriteUrlForTunnel("https://local-test.tunnel", 12345, "https");
      expect(result).toBe("http://127.0.0.1:12345/");
    });

    it("should preserve trailing slash in path", () => {
      const result = rewriteUrlForTunnel("https://local-test.tunnel/api/", 12345, "https");
      expect(result).toBe("http://127.0.0.1:12345/api/");
    });
  });

  describe("query string preservation", () => {
    it("should preserve simple query string", () => {
      const result = rewriteUrlForTunnel(
        "https://local-test.tunnel/search?q=hello",
        12345,
        "https",
      );
      expect(result).toBe("http://127.0.0.1:12345/search?q=hello");
    });

    it("should preserve multiple query parameters", () => {
      const result = rewriteUrlForTunnel(
        "https://local-test.tunnel/api?page=1&limit=10&sort=name",
        12345,
        "https",
      );
      expect(result).toBe("http://127.0.0.1:12345/api?page=1&limit=10&sort=name");
    });

    it("should preserve encoded query parameters", () => {
      const result = rewriteUrlForTunnel(
        "https://local-test.tunnel/search?q=hello%20world&filter=a%26b",
        12345,
        "https",
      );
      expect(result).toBe("http://127.0.0.1:12345/search?q=hello%20world&filter=a%26b");
    });

    it("should handle empty query string (stripped by URL parser)", () => {
      const result = rewriteUrlForTunnel("https://local-test.tunnel/api?", 12345, "https");
      // Note: URL parser normalizes empty query string to no query string
      expect(result).toBe("http://127.0.0.1:12345/api");
    });
  });

  describe("protocol mapping", () => {
    it("should map http to http", () => {
      const result = rewriteUrlForTunnel("http://local-test.tunnel/api", 12345, "http");
      expect(result).toBe("http://127.0.0.1:12345/api");
    });

    it("should map https to http (tunnel handles TLS)", () => {
      const result = rewriteUrlForTunnel("https://local-test.tunnel/api", 12345, "https");
      expect(result).toBe("http://127.0.0.1:12345/api");
    });

    it("should map postgres to postgres", () => {
      const result = rewriteUrlForTunnel("postgres://local-test.tunnel/mydb", 12345, "postgres");
      expect(result).toBe("postgres://127.0.0.1:12345/mydb");
    });

    it("should map postgresql to postgres", () => {
      const result = rewriteUrlForTunnel(
        "postgresql://local-test.tunnel/mydb",
        12345,
        "postgresql",
      );
      expect(result).toBe("postgres://127.0.0.1:12345/mydb");
    });

    it("should map sftp to sftp", () => {
      const result = rewriteUrlForTunnel("sftp://local-test.tunnel/path", 12345, "sftp");
      expect(result).toBe("sftp://127.0.0.1:12345/path");
    });

    it("should map ftp to ftp", () => {
      const result = rewriteUrlForTunnel("ftp://local-test.tunnel/path", 12345, "ftp");
      expect(result).toBe("ftp://127.0.0.1:12345/path");
    });

    it("should map smb to smb", () => {
      const result = rewriteUrlForTunnel("smb://local-test.tunnel/share", 12345, "smb");
      expect(result).toBe("smb://127.0.0.1:12345/share");
    });

    it("should default unknown protocols to http", () => {
      const result = rewriteUrlForTunnel("custom://local-test.tunnel/path", 12345, "custom");
      expect(result).toBe("http://127.0.0.1:12345/path");
    });

    it("should handle case-insensitive protocol", () => {
      const result = rewriteUrlForTunnel("HTTPS://local-test.tunnel/api", 12345, "HTTPS");
      expect(result).toBe("http://127.0.0.1:12345/api");
    });
  });

  describe("edge cases", () => {
    it("should handle invalid URL gracefully", () => {
      const result = rewriteUrlForTunnel("not-a-valid-url", 12345, "http");
      expect(result).toBe("http://127.0.0.1:12345");
    });

    it("should handle empty URL", () => {
      const result = rewriteUrlForTunnel("", 12345, "http");
      expect(result).toBe("http://127.0.0.1:12345");
    });

    it("should handle URL with special characters in path", () => {
      const result = rewriteUrlForTunnel(
        "https://local-test.tunnel/api/users/john%40example.com",
        12345,
        "https",
      );
      expect(result).toBe("http://127.0.0.1:12345/api/users/john%40example.com");
    });

    it("should handle URL with port in original (port is ignored)", () => {
      const result = rewriteUrlForTunnel("https://local-test.tunnel:8080/api", 12345, "https");
      expect(result).toBe("http://127.0.0.1:12345/api");
    });

    it("should handle URL with hash fragment (fragment is stripped by URL parser)", () => {
      const result = rewriteUrlForTunnel("https://local-test.tunnel/page#section", 12345, "https");
      // Note: URL.hash is not included in pathname+search, which is correct behavior
      // for API calls (fragments are client-side only)
      expect(result).toBe("http://127.0.0.1:12345/page");
    });

    it("should preserve username/password for database URLs", () => {
      // Database connection strings require credentials in the URL
      // secretlint-disable-next-line
      const result = rewriteUrlForTunnel(
        "postgres://u:p@local-test.tunnel/mydb",
        12345,
        "postgres",
      );
      // secretlint-disable-next-line
      expect(result).toBe("postgres://u:p@127.0.0.1:12345/mydb");
    });

    it("should preserve username only (no password)", () => {
      const result = rewriteUrlForTunnel("postgres://u@local-test.tunnel/mydb", 12345, "postgres");
      expect(result).toBe("postgres://u@127.0.0.1:12345/mydb");
    });

    it("should preserve credentials for HTTP URLs too", () => {
      // Some APIs use basic auth in URL
      // secretlint-disable-next-line
      const result = rewriteUrlForTunnel("https://x:y@local-test.tunnel/api", 12345, "https");
      // secretlint-disable-next-line
      expect(result).toBe("http://x:y@127.0.0.1:12345/api");
    });
  });
});
