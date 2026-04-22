import { describe, it, expect } from "vitest";
import { validateExternalUrl } from "./utils.js";

describe("validateExternalUrl", () => {
  // ======================================================================
  // Valid external URLs — should pass
  // ======================================================================
  describe("allows valid external URLs", () => {
    it("allows standard HTTPS URLs", () => {
      const url = validateExternalUrl("https://api.example.com/v1/data");
      expect(url.hostname).toBe("api.example.com");
    });

    it("allows standard HTTP URLs", () => {
      const url = validateExternalUrl("http://example.com");
      expect(url.hostname).toBe("example.com");
    });

    it("allows URLs with ports", () => {
      const url = validateExternalUrl("https://api.example.com:8443/webhook");
      expect(url.hostname).toBe("api.example.com");
    });

    it("allows public IP addresses", () => {
      const url = validateExternalUrl("https://8.8.8.8/dns-query");
      expect(url.hostname).toBe("8.8.8.8");
    });

    it("allows non-private 172.x addresses (outside 172.16-31 range)", () => {
      expect(() => validateExternalUrl("http://172.15.0.1")).not.toThrow();
      expect(() => validateExternalUrl("http://172.32.0.1")).not.toThrow();
    });
  });

  // ======================================================================
  // Protocol validation
  // ======================================================================
  describe("blocks non-HTTP protocols", () => {
    it("blocks ftp://", () => {
      expect(() => validateExternalUrl("ftp://evil.com/file")).toThrow("Unsupported protocol");
    });

    it("blocks file://", () => {
      expect(() => validateExternalUrl("file:///etc/passwd")).toThrow("Unsupported protocol");
    });

    it("blocks javascript:", () => {
      expect(() => validateExternalUrl("javascript:alert(1)")).toThrow();
    });
  });

  // ======================================================================
  // Loopback blocking (127.0.0.0/8)
  // ======================================================================
  describe("blocks loopback addresses", () => {
    it("blocks localhost", () => {
      expect(() => validateExternalUrl("http://localhost/admin")).toThrow("not allowed");
    });

    it("blocks 127.0.0.1", () => {
      expect(() => validateExternalUrl("http://127.0.0.1")).toThrow("not allowed");
    });

    it("blocks other 127.x.x.x addresses", () => {
      expect(() => validateExternalUrl("http://127.0.0.2")).toThrow("not allowed");
      expect(() => validateExternalUrl("http://127.255.255.255")).toThrow("not allowed");
    });

    it("blocks IPv6 loopback ::1", () => {
      expect(() => validateExternalUrl("http://[::1]")).toThrow("not allowed");
    });
  });

  // ======================================================================
  // RFC 1918 private networks — the core SSRF fix
  // ======================================================================
  describe("blocks RFC 1918 private networks", () => {
    describe("10.0.0.0/8", () => {
      it("blocks 10.0.0.1", () => {
        expect(() => validateExternalUrl("http://10.0.0.1")).toThrow("not allowed");
      });

      it("blocks 10.0.0.1 with path", () => {
        expect(() => validateExternalUrl("http://10.0.0.1:8080/admin")).toThrow("not allowed");
      });

      it("blocks 10.255.255.255", () => {
        expect(() => validateExternalUrl("http://10.255.255.255")).toThrow("not allowed");
      });

      it("blocks 10.10.10.10", () => {
        expect(() => validateExternalUrl("http://10.10.10.10/api")).toThrow("not allowed");
      });
    });

    describe("172.16.0.0/12", () => {
      it("blocks 172.16.0.1", () => {
        expect(() => validateExternalUrl("http://172.16.0.1")).toThrow("not allowed");
      });

      it("blocks 172.31.255.255 (upper bound)", () => {
        expect(() => validateExternalUrl("http://172.31.255.255")).toThrow("not allowed");
      });

      it("blocks 172.20.0.1 (mid-range)", () => {
        expect(() => validateExternalUrl("http://172.20.0.1")).toThrow("not allowed");
      });
    });

    describe("192.168.0.0/16", () => {
      it("blocks 192.168.0.1", () => {
        expect(() => validateExternalUrl("http://192.168.0.1")).toThrow("not allowed");
      });

      it("blocks 192.168.1.1", () => {
        expect(() => validateExternalUrl("http://192.168.1.1")).toThrow("not allowed");
      });

      it("blocks 192.168.255.255", () => {
        expect(() => validateExternalUrl("http://192.168.255.255")).toThrow("not allowed");
      });
    });
  });

  // ======================================================================
  // Link-local addresses
  // ======================================================================
  describe("blocks link-local addresses", () => {
    it("blocks 169.254.x.x (AWS/GCP/Azure metadata range)", () => {
      expect(() => validateExternalUrl("http://169.254.169.254/latest/meta-data")).toThrow(
        "not allowed",
      );
    });

    it("blocks 169.254.0.1", () => {
      expect(() => validateExternalUrl("http://169.254.0.1")).toThrow("not allowed");
    });
  });

  // ======================================================================
  // IPv6 special addresses
  // ======================================================================
  describe("blocks IPv6 private/special addresses", () => {
    it("blocks IPv6 unique local fc00::", () => {
      expect(() => validateExternalUrl("http://[fc00::1]")).toThrow("not allowed");
    });

    it("blocks IPv6 unique local fd00::", () => {
      expect(() => validateExternalUrl("http://[fd12:3456:789a::1]")).toThrow("not allowed");
    });

    it("blocks IPv6 link-local fe80::", () => {
      expect(() => validateExternalUrl("http://[fe80::1]")).toThrow("not allowed");
    });

    it("blocks full fe80::/10 range (feb0:: is still link-local)", () => {
      expect(() => validateExternalUrl("http://[feb0::1]")).toThrow("not allowed");
    });

    it("does NOT block DNS hostnames starting with fc/fd (no false positives)", () => {
      expect(() => validateExternalUrl("https://fcm.googleapis.com/v1/send")).not.toThrow();
      expect(() => validateExternalUrl("https://fd-api.example.com/data")).not.toThrow();
    });
  });

  // ======================================================================
  // IPv4-mapped IPv6 bypass attempts
  // ======================================================================
  describe("blocks IPv4-mapped IPv6 bypass attempts", () => {
    it("blocks ::ffff:127.0.0.1 (loopback bypass)", () => {
      expect(() => validateExternalUrl("http://[::ffff:127.0.0.1]")).toThrow("not allowed");
    });

    it("blocks ::ffff:10.0.0.1 (private network bypass)", () => {
      expect(() => validateExternalUrl("http://[::ffff:10.0.0.1]")).toThrow("not allowed");
    });

    it("blocks ::ffff:192.168.1.1 (private network bypass)", () => {
      expect(() => validateExternalUrl("http://[::ffff:192.168.1.1]")).toThrow("not allowed");
    });

    it("blocks ::ffff:172.16.0.1 (private network bypass)", () => {
      expect(() => validateExternalUrl("http://[::ffff:172.16.0.1]")).toThrow("not allowed");
    });
  });

  // ======================================================================
  // Unspecified / wildcard addresses
  // ======================================================================
  describe("blocks unspecified addresses", () => {
    it("blocks 0.0.0.0", () => {
      expect(() => validateExternalUrl("http://0.0.0.0")).toThrow("not allowed");
    });
  });

  // ======================================================================
  // Cloud metadata / internal service discovery
  // ======================================================================
  describe("blocks cloud internal hostnames", () => {
    it("blocks .internal suffix", () => {
      expect(() => validateExternalUrl("http://metadata.google.internal")).toThrow("not allowed");
    });

    it("blocks arbitrary .internal suffix", () => {
      expect(() => validateExternalUrl("http://my-service.internal")).toThrow("not allowed");
    });
  });
});
