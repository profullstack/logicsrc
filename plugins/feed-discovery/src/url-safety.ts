import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

export async function assertSafeHttpUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".localhost")) {
    throw new Error(`Blocked internal hostname: ${hostname}`);
  }

  if (isBlockedIp(hostname)) {
    throw new Error(`Blocked internal IP address: ${hostname}`);
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  for (const address of addresses) {
    if (isBlockedIp(address.address)) {
      throw new Error(`Blocked internal resolved address: ${address.address}`);
    }
  }

  return url;
}

export function canonicalizeUrl(input: string, base?: string) {
  const url = new URL(input, base);
  url.hash = "";

  for (const param of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(param)) {
      url.searchParams.delete(param);
    }
  }

  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

function isBlockedIp(value: string) {
  const kind = isIP(value);
  if (kind === 4) {
    const parts = value.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }

  if (kind === 6) {
    const normalized = value.toLowerCase();
    const compatibleDottedIpv4 = /^::(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (compatibleDottedIpv4) {
      return isBlockedIp(compatibleDottedIpv4[1]);
    }
    const compatibleHexIpv4 = /^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
    if (compatibleHexIpv4) {
      const high = Number.parseInt(compatibleHexIpv4[1], 16);
      const low = Number.parseInt(compatibleHexIpv4[2], 16);
      return isBlockedIp(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    const mappedDottedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (mappedDottedIpv4) {
      return isBlockedIp(mappedDottedIpv4[1]);
    }
    const mappedHexIpv4 = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
    if (mappedHexIpv4) {
      const high = Number.parseInt(mappedHexIpv4[1], 16);
      const low = Number.parseInt(mappedHexIpv4[2], 16);
      return isBlockedIp(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    );
  }

  return false;
}
