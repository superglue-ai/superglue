import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseSMBConnectionUrl } from "./smb.js";

// Mock the smb2 library
vi.mock("@awo00/smb2", () => ({
  default: {
    Client: vi.fn(),
  },
}));

// Mock dependencies
vi.mock("../../../utils/logs.js", () => ({
  logMessage: vi.fn(),
}));

vi.mock("../../../files/index.js", () => ({
  parseFile: vi.fn().mockRejectedValue(new Error("Not a known file type")),
  parseJSON: vi.fn((str) => JSON.parse(str)),
}));

vi.mock("../../../utils/helpers.js", () => ({
  replaceVariables: vi.fn((str) => Promise.resolve(str)),
}));

describe("SMB URL Parsing", () => {
  describe("parseSMBConnectionUrl", () => {
    it("should parse basic SMB URL", () => {
      const result = parseSMBConnectionUrl("smb://user:pass@host.com/share");

      expect(result.host).toBe("host.com");
      expect(result.port).toBe(445);
      expect(result.username).toBe("user");
      expect(result.password).toBe("pass");
      expect(result.share).toBe("share");
      expect(result.domain).toBeUndefined();
      expect(result.basePath).toBeUndefined();
    });

    it("should parse SMB URL with custom port", () => {
      const result = parseSMBConnectionUrl("smb://user:pass@host.com:3390/share");

      expect(result.host).toBe("host.com");
      expect(result.port).toBe(3390);
      expect(result.share).toBe("share");
    });

    it("should parse SMB URL with base path", () => {
      const result = parseSMBConnectionUrl("smb://user:pass@host.com/share/data/files");

      expect(result.share).toBe("share");
      expect(result.basePath).toBe("/data/files");
    });

    it("should parse SMB URL with domain using backslash", () => {
      const result = parseSMBConnectionUrl("smb://CORP\\user:pass@host.com/share");

      expect(result.domain).toBe("CORP");
      expect(result.username).toBe("user");
      expect(result.password).toBe("pass");
      expect(result.host).toBe("host.com");
      expect(result.share).toBe("share");
    });

    it("should parse SMB URL with domain and custom port", () => {
      const result = parseSMBConnectionUrl(
        "smb://DOMAIN\\admin:secret@192.168.1.100:3390/SharedData",
      );

      expect(result.domain).toBe("DOMAIN");
      expect(result.username).toBe("admin");
      expect(result.password).toBe("secret");
      expect(result.host).toBe("192.168.1.100");
      expect(result.port).toBe(3390);
      expect(result.share).toBe("SharedData");
    });

    it("should handle @ symbol in password", () => {
      const result = parseSMBConnectionUrl("smb://user:p@ssw0rd@host.com/share");

      expect(result.username).toBe("user");
      expect(result.password).toBe("p@ssw0rd");
    });

    it("should handle multiple @ symbols in password", () => {
      const result = parseSMBConnectionUrl("smb://user:p@ss@w0rd@host.com/share");

      expect(result.username).toBe("user");
      expect(result.password).toBe("p@ss@w0rd");
    });

    it("should handle special characters in password", () => {
      const result = parseSMBConnectionUrl("smb://user:p@$$w0rd!@host.com/share");

      expect(result.username).toBe("user");
      expect(result.password).toBe("p@$$w0rd!");
    });

    it("should handle colon in password", () => {
      const result = parseSMBConnectionUrl("smb://user:pass:word@host.com/share");

      expect(result.username).toBe("user");
      expect(result.password).toBe("pass:word");
    });

    it("should handle domain with special characters in password", () => {
      const result = parseSMBConnectionUrl(
        "smb://CORP\\admin:P@ss:W0rd!@#$@192.168.1.100:3390/Data",
      );

      expect(result.domain).toBe("CORP");
      expect(result.username).toBe("admin");
      expect(result.password).toBe("P@ss:W0rd!@#$");
      expect(result.host).toBe("192.168.1.100");
      expect(result.port).toBe(3390);
      expect(result.share).toBe("Data");
    });

    it("should handle URL-encoded characters", () => {
      const result = parseSMBConnectionUrl("smb://user:pass%40word@host.com/share");

      expect(result.username).toBe("user");
      expect(result.password).toBe("pass@word");
    });

    it("should handle spaces in credentials (encoded)", () => {
      const result = parseSMBConnectionUrl("smb://user:pass%20word@host.com/share");

      expect(result.username).toBe("user");
      expect(result.password).toBe("pass word");
    });

    it("should handle trailing slash in URL", () => {
      const result = parseSMBConnectionUrl("smb://user:pass@host.com/share/");

      expect(result.share).toBe("share");
      expect(result.basePath).toBeUndefined();
    });

    it("should handle share with nested path and trailing slash", () => {
      const result = parseSMBConnectionUrl("smb://user:pass@host.com/share/folder/subfolder/");

      expect(result.share).toBe("share");
      expect(result.basePath).toBe("/folder/subfolder");
    });

    it("should throw error for non-SMB protocol", () => {
      expect(() => parseSMBConnectionUrl("ftp://user:pass@host.com/share")).toThrow(
        "Invalid URL: protocol must be smb",
      );
    });

    it("should throw error for missing share name", () => {
      expect(() => parseSMBConnectionUrl("smb://user:pass@host.com")).toThrow(
        "SMB URL must include a share name",
      );
    });

    it("should throw error for empty share name", () => {
      expect(() => parseSMBConnectionUrl("smb://user:pass@host.com/")).toThrow(
        "SMB URL must include a share name",
      );
    });

    it("should preserve case sensitivity in credentials", () => {
      const result = parseSMBConnectionUrl("smb://UserName:PaSsWoRd@host.com/Share");

      expect(result.username).toBe("UserName");
      expect(result.password).toBe("PaSsWoRd");
      expect(result.share).toBe("Share");
    });

    it("should preserve case sensitivity in domain", () => {
      const result = parseSMBConnectionUrl("smb://MyDomain\\UserName:pass@host.com/share");

      expect(result.domain).toBe("MyDomain");
      expect(result.username).toBe("UserName");
    });

    it("should handle real-world Windows server scenario", () => {
      const result = parseSMBConnectionUrl(
        "smb://EC2AMAZ-426FNHL\\smbtest:TestPass123!@ec2-44-222-232-176.compute-1.amazonaws.com:3390/SharedData/uploads",
      );

      expect(result.domain).toBe("EC2AMAZ-426FNHL");
      expect(result.username).toBe("smbtest");
      expect(result.password).toBe("TestPass123!");
      expect(result.host).toBe("ec2-44-222-232-176.compute-1.amazonaws.com");
      expect(result.port).toBe(3390);
      expect(result.share).toBe("SharedData");
      expect(result.basePath).toBe("/uploads");
    });

    it("should handle IP address as host", () => {
      const result = parseSMBConnectionUrl("smb://user:pass@192.168.1.100/share");

      expect(result.host).toBe("192.168.1.100");
      expect(result.port).toBe(445);
    });

    it("should handle URL without password", () => {
      const result = parseSMBConnectionUrl("smb://user@host.com/share");

      expect(result.username).toBe("user");
      expect(result.password).toBeUndefined();
    });

    it("should handle domain without password", () => {
      const result = parseSMBConnectionUrl("smb://DOMAIN\\user@host.com/share");

      expect(result.domain).toBe("DOMAIN");
      expect(result.username).toBe("user");
      expect(result.password).toBeUndefined();
    });
  });
});

describe("SMB callSMB validation", () => {
  // Import callSMB after mocks are set up
  let callSMB: typeof import("./smb.js").callSMB;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("./smb.js");
    callSMB = module.callSMB;
  });

  it("should throw error for empty operations array", async () => {
    const { replaceVariables } = await import("../../../utils/helpers.js");
    vi.mocked(replaceVariables).mockImplementation((str) => Promise.resolve(str));

    const { parseJSON } = await import("../../../files/index.js");
    vi.mocked(parseJSON).mockReturnValue([]);

    await expect(
      callSMB({
        endpoint: {
          url: "smb://user:pass@host.com/share",
          body: "[]",
        },
        credentials: {},
        options: {},
        metadata: { orgId: "test", traceId: "test" },
      }),
    ).rejects.toThrow("No operations provided");
  });

  it("should throw error for missing operation field", async () => {
    const { replaceVariables } = await import("../../../utils/helpers.js");
    vi.mocked(replaceVariables).mockImplementation((str) => Promise.resolve(str));

    const { parseJSON } = await import("../../../files/index.js");
    vi.mocked(parseJSON).mockReturnValue({ path: "/test" });

    await expect(
      callSMB({
        endpoint: {
          url: "smb://user:pass@host.com/share",
          body: '{"path": "/test"}',
        },
        credentials: {},
        options: {},
        metadata: { orgId: "test", traceId: "test" },
      }),
    ).rejects.toThrow("Missing 'operation' field");
  });

  it("should throw error for unsupported operation", async () => {
    const { replaceVariables } = await import("../../../utils/helpers.js");
    vi.mocked(replaceVariables).mockImplementation((str) => Promise.resolve(str));

    const { parseJSON } = await import("../../../files/index.js");
    vi.mocked(parseJSON).mockReturnValue({ operation: "invalid_op", path: "/test" });

    await expect(
      callSMB({
        endpoint: {
          url: "smb://user:pass@host.com/share",
          body: '{"operation": "invalid_op", "path": "/test"}',
        },
        credentials: {},
        options: {},
        metadata: { orgId: "test", traceId: "test" },
      }),
    ).rejects.toThrow("Unsupported operation: 'invalid_op'");
  });

  it("should throw error for invalid JSON body", async () => {
    const { replaceVariables } = await import("../../../utils/helpers.js");
    vi.mocked(replaceVariables).mockImplementation((str) => Promise.resolve(str));

    const { parseJSON } = await import("../../../files/index.js");
    vi.mocked(parseJSON).mockImplementation(() => {
      throw new Error("Unexpected token");
    });

    await expect(
      callSMB({
        endpoint: {
          url: "smb://user:pass@host.com/share",
          body: "not valid json",
        },
        credentials: {},
        options: {},
        metadata: { orgId: "test", traceId: "test" },
      }),
    ).rejects.toThrow("Invalid JSON in body");
  });
});
