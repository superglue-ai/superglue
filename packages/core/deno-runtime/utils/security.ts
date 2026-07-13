/**
 * SSRF protection for the Deno sandbox.
 *
 * Installs a hardened `globalThis.fetch` (on import) that:
 *   - resolves each target hostname via DNS and rejects any request whose
 *     hostname OR resolved IP is a cloud metadata endpoint (always) or a
 *     local/private address (when BLOCK_LOCAL_REQUESTS=true),
 *   - follows redirects manually so every hop is re-validated against the
 *     denylist (a redirect to an internal host is blocked like a direct one).
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

function applyRedirect(init: RequestInit, status: number): RequestInit {
  const next: RequestInit = { ...init };
  const method = (next.method || "GET").toUpperCase();
  if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
    next.method = "GET";
    delete next.body;
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
    currentInit = applyRedirect(currentInit, response.status);
    currentUrl = new URL(response.headers.get("location")!, currentUrl);
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

  // Decode IPv4-in-IPv6 forms — mapped (::ffff:169.254.169.254) and compatible
  // (::169.254.169.254, which the URL parser normalizes to ::a9fe:a9fe) — so an
  // embedded metadata IP can't be smuggled past the checks below.
  const embedded = embeddedIPv4(raw);
  if (embedded && embedded !== raw) return isCloudMetadataHost(embedded);

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

  if (
    raw === "localhost" ||
    raw === "::1" ||
    raw === "::" ||
    raw === "0.0.0.0" ||
    raw.endsWith(".internal")
  ) {
    return true;
  }

  // Decode IPv4-in-IPv6 forms (mapped ::ffff:… and compatible ::…) and re-check,
  // so an internal IPv4 address can't slip through wearing IPv6 clothing.
  const embedded = embeddedIPv4(raw);
  if (embedded && embedded !== raw) return isInternalHost(embedded);

  // IPv6 private/link-local ranges, matched on the first hextet so the full
  // documented ranges are covered (not just their base address):
  //   fe80::/10 (link-local) → top 10 bits === 0xfe80, spans fe80–febf
  //   fc00::/7  (unique local) → top 7 bits  === 0xfc00, spans fc00–fdff
  if (raw.includes(":")) {
    const firstHextet = parseInt(raw.split(":")[0] || "0", 16);
    if (!isNaN(firstHextet)) {
      if ((firstHextet & 0xffc0) === 0xfe80) return true;
      if ((firstHextet & 0xfe00) === 0xfc00) return true;
    }
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

/**
 * Extracts the embedded IPv4 address from an IPv4-in-IPv6 host, or null if the
 * host isn't one. Covers both the IPv4-mapped form (`::ffff:a.b.c.d`) and the
 * deprecated IPv4-compatible form (`::a.b.c.d`). The URL parser normalizes the
 * trailing IPv4 to hex (e.g. `::169.254.169.254` → `::a9fe:a9fe`,
 * `::ffff:10.0.0.1` → `::ffff:a00:1`), so both dotted and 2-hextet forms are
 * handled. Returns null for `::`, `::1`, and any address whose low 32 bits
 * aren't expressed as a single trailing IPv4/2-hextet group.
 */
function embeddedIPv4(raw: string): string | null {
  let suffix: string;
  if (raw.startsWith("::ffff:")) {
    suffix = raw.slice("::ffff:".length);
  } else if (raw.startsWith("::") && raw !== "::" && raw !== "::1") {
    suffix = raw.slice("::".length);
  } else {
    return null;
  }

  // Dotted trailing IPv4 (e.g. ::ffff:10.0.0.1 before normalization)
  if (suffix.includes(".")) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(suffix) ? suffix : null;
  }

  // Two-hextet trailing IPv4 (e.g. ::a9fe:a9fe → 169.254.169.254)
  const groups = suffix.split(":");
  if (groups.length !== 2) return null;
  const high = parseInt(groups[0], 16);
  const low = parseInt(groups[1], 16);
  if (isNaN(high) || isNaN(low)) return null;
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}
