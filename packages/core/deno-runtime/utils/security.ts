/**
 * SSRF protection for the Deno sandbox.
 *
 * Installs a hardened `globalThis.fetch` (on import) that:
 *   - resolves each target hostname via DNS and rejects any request whose
 *     hostname OR resolved IP is a cloud metadata endpoint (always) or a
 *     local/private address (when BLOCK_LOCAL_REQUESTS=true),
 *   - follows redirects manually so every hop is re-validated, stripping
 *     Authorization/Cookie on cross-origin hops.
 *
 * Cloud metadata endpoints (AWS/GCP/Azure/Alibaba IMDS) are blocked
 * unconditionally, regardless of configuration.
 */

const originalFetch = globalThis.fetch;

// Name used on SSRF-block errors so request strategies can fail fast instead of
// retrying a request that will always be blocked.
export const SSRF_BLOCKED_ERROR_NAME = "SSRFBlockedError";

function ssrfBlocked(message: string): TypeError {
  const err = new TypeError(message);
  err.name = SSRF_BLOCKED_ERROR_NAME;
  return err;
}

// Per-execution tunnel port allowlist. The Deno worker is pooled and reused
// across executions with different tunnel mappings, so tunnel ports are set
// per execution via setAllowedTunnelPorts() rather than a spawn-time env var.
let runtimeTunnelPorts: Set<string> | null = null;

export function setAllowedTunnelPorts(ports: Iterable<string | number>): void {
  runtimeTunnelPorts = new Set([...ports].map((p) => String(p)));
}

function getAllowedTunnelPorts(): Set<string> {
  if (runtimeTunnelPorts) return runtimeTunnelPorts;
  const raw = Deno.env.get("TUNNEL_PORTS");
  return raw ? new Set(raw.split(",")) : new Set();
}

function isAllowedTunnelTarget(hostname: string, port: string): boolean {
  if (hostname !== "127.0.0.1") return false;
  return getAllowedTunnelPorts().has(port);
}

async function resolveAndCheck(hostname: string, port: string): Promise<void> {
  if (isAllowedTunnelTarget(hostname, port)) return;
  if (isInternalHost(hostname)) {
    throw ssrfBlocked(`Blocked request to internal host: ${hostname}`);
  }
  // Resolve DNS and check every returned IP against the denylist
  try {
    const aRecords = await Deno.resolveDns(hostname, "A").catch(() => [] as string[]);
    const aaaaRecords = await Deno.resolveDns(hostname, "AAAA").catch(() => [] as string[]);
    for (const ip of [...aRecords, ...aaaaRecords]) {
      if (isInternalHost(ip)) {
        throw ssrfBlocked(`Blocked request: ${hostname} resolves to internal address ${ip}`);
      }
    }
  } catch (e) {
    if (e instanceof TypeError) throw e;
    // DNS resolution failed (e.g. IP literal) — isInternalHost already checked the hostname
  }
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;

// Credential-bearing headers stripped when a redirect crosses origins, so
// configured secrets are never forwarded to an untrusted redirect target.
// Covers the standardized auth/cookie headers plus the common custom
// API-key / token header names used by APIs superglue talks to.
const CROSS_ORIGIN_STRIPPED_HEADERS = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "cookie2",
  "www-authenticate",
  "x-api-key",
  "api-key",
  "apikey",
  "x-auth-token",
  "x-access-token",
  "x-csrf-token",
  "x-amz-security-token",
];

function stripSensitiveHeaders(headers: HeadersInit | undefined): Headers {
  const h = new Headers(headers);
  for (const name of CROSS_ORIGIN_STRIPPED_HEADERS) h.delete(name);
  return h;
}

function applyRedirect(init: RequestInit, status: number, sameOrigin: boolean): RequestInit {
  const next: RequestInit = { ...init };
  const method = (next.method || "GET").toUpperCase();
  if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
    next.method = "GET";
    delete next.body;
  }
  if (!sameOrigin) {
    next.headers = stripSensitiveHeaders(next.headers as HeadersInit | undefined);
  }
  return next;
}

globalThis.fetch = async function safeFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  let currentUrl = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  let currentInit: RequestInit =
    input instanceof Request
      ? { method: input.method, headers: new Headers(input.headers), ...init }
      : { ...(init ?? {}) };

  await resolveAndCheck(currentUrl.hostname, currentUrl.port);
  let response = await originalFetch(input, { ...init, redirect: "manual" });

  let hops = 0;
  while (REDIRECT_STATUS.has(response.status) && response.headers.get("location")) {
    if (++hops > MAX_REDIRECTS) {
      // Release the body before bailing — redirect:"manual" leaves it open.
      await response.body?.cancel().catch(() => {});
      throw ssrfBlocked(`Too many redirects (>${MAX_REDIRECTS})`);
    }
    const nextUrl = new URL(response.headers.get("location")!, currentUrl);
    currentInit = applyRedirect(currentInit, response.status, nextUrl.origin === currentUrl.origin);
    currentUrl = nextUrl;
    // With redirect:"manual" the runtime does not auto-close redirect bodies,
    // so cancel this hop's body before overwriting it to avoid leaking the
    // underlying stream resource across a long redirect chain. Done before
    // resolveAndCheck so a blocked next hop still releases the current body.
    await response.body?.cancel().catch(() => {});
    await resolveAndCheck(currentUrl.hostname, currentUrl.port);
    response = await originalFetch(currentUrl.href, { ...currentInit, redirect: "manual" });
  }
  return response;
};

export function isCloudMetadataHost(hostname: string): boolean {
  const raw = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // GCP metadata server hostnames (resolve to 169.254.169.254)
  if (raw === "metadata.google.internal" || raw === "metadata.goog") return true;

  // IPv4-mapped IPv6 form of a metadata IP (e.g. ::ffff:169.254.169.254)
  if (raw.startsWith("::ffff:")) {
    const decoded = decodeIPv4MappedIPv6(raw);
    if (decoded !== raw) return isCloudMetadataHost(decoded);
  }

  // Link-local 169.254.0.0/16 — AWS EC2 IMDS (169.254.169.254),
  // ECS task metadata (169.254.170.2), Azure IMDS, GCP all live here
  if (raw.startsWith("169.254.")) return true;

  // Alibaba Cloud metadata
  if (raw === "100.100.100.200") return true;

  // Azure WireServer / host plugin (not link-local)
  if (raw === "168.63.129.16") return true;

  // AWS IMDS over IPv6
  if (raw === "fd00:ec2::254") return true;

  return false;
}

export function isInternalHost(hostname: string): boolean {
  // Cloud metadata endpoints are always blocked, regardless of configuration.
  if (isCloudMetadataHost(hostname)) return true;

  // Localhost and private networks are only blocked when explicitly enabled.
  if (Deno.env.get("BLOCK_LOCAL_REQUESTS") !== "true") return false;
  const raw = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (raw === "localhost" || raw === "::1" || raw === "0.0.0.0" || raw.endsWith(".internal")) {
    return true;
  }

  // IPv6 private/link-local ranges, matched on the first hextet so the full
  // documented ranges are covered (not just their base address):
  //   fe80::/10 (link-local) → top 10 bits === 0xfe80, spans fe80–febf
  //   fc00::/7  (unique local) → top 7 bits  === 0xfc00, spans fc00–fdff
  if (raw.includes(":") && !raw.startsWith("::ffff:")) {
    const firstHextet = parseInt(raw.split(":")[0] || "0", 16);
    if (!isNaN(firstHextet)) {
      if ((firstHextet & 0xffc0) === 0xfe80) return true;
      if ((firstHextet & 0xfe00) === 0xfc00) return true;
    }
  }
  if (raw.startsWith("::ffff:")) {
    const decoded = decodeIPv4MappedIPv6(raw);
    if (decoded !== raw) return isInternalHost(decoded);
    return false;
  }

  // IPv4 numeric checks
  const parts = raw.split(".").map(Number);
  if (parts.length === 4 && parts.every((p: number) => !isNaN(p) && p >= 0 && p <= 255)) {
    if (parts[0] === 127) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
  }
  return false;
}

function decodeIPv4MappedIPv6(raw: string): string {
  const hex = raw.slice("::ffff:".length);
  if (hex.includes(".")) return hex;
  const parts = hex.split(":").map((h: string) => parseInt(h, 16));
  if (parts.length === 2)
    return `${(parts[0] >> 8) & 0xff}.${parts[0] & 0xff}.${(parts[1] >> 8) & 0xff}.${parts[1] & 0xff}`;
  return raw;
}
