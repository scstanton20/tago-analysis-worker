/**
 * SSRF (Server-Side Request Forgery) protection for analysis processes
 *
 * Protection Strategy:
 * - Blocks critical services: localhost, cloud metadata endpoints, reserved ranges
 * - Allows LAN/private network access: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
 * - Prevents DNS rebinding attacks against metadata services
 */
import { createChildLogger } from './logging/logger.ts';

const logger = createChildLogger('ssrf-protection');

interface IPRange {
  range: string;
  start: string;
  end: string;
}

interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

interface FilteredAddressResult extends ValidationResult {
  filteredAddresses?: string[];
}

// Critical blocked IP ranges - only block dangerous/sensitive services
// Allows LAN/private network access for legitimate internal services
const PRIVATE_IP_RANGES: IPRange[] = [
  // Loopback - prevents localhost access
  { range: '127.0.0.0/8', start: '127.0.0.0', end: '127.255.255.255' },
  // Link-local (includes AWS/GCP metadata endpoint 169.254.169.254)
  { range: '169.254.0.0/16', start: '169.254.0.0', end: '169.254.255.255' },
  // Multicast - generally not needed for application traffic
  { range: '224.0.0.0/4', start: '224.0.0.0', end: '239.255.255.255' },
  // Reserved/experimental ranges
  { range: '240.0.0.0/4', start: '240.0.0.0', end: '255.255.255.255' },
  // Unspecified/invalid range
  { range: '0.0.0.0/8', start: '0.0.0.0', end: '0.255.255.255' },
];

// Blocked hostnames (case-insensitive)
const BLOCKED_HOSTNAMES: string[] = [
  'localhost',
  'metadata', // AWS metadata service
  'metadata.google.internal', // GCP metadata
  '169.254.169.254', // AWS metadata IP
];

// IPv6 blocked patterns - only critical services
// Allows ULA (fc00::/7, fd00::/8) for private IPv6 networks
const IPV6_BLOCKED_PATTERNS: RegExp[] = [
  /^::1$/, // Loopback
  /^::ffff:/, // IPv4-mapped IPv6 (could map to blocked IPv4 ranges)
  /^fe80:/, // Link-local (prevents access to local network services on IPv6)
  /^ff00:/, // Multicast
];

/**
 * Convert IPv4 address string to 32-bit integer
 */
function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return parts.reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
}

/**
 * Check if an IPv4 address is in a blocked range (critical services only)
 * Allows private network ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
 */
function isPrivateIPv4(ip: string): boolean {
  const ipInt = ipToInt(ip);
  if (ipInt === null) return false;

  return PRIVATE_IP_RANGES.some((range) => {
    const startInt = ipToInt(range.start);
    const endInt = ipToInt(range.end);
    if (startInt === null || endInt === null) return false;
    return ipInt >= startInt && ipInt <= endInt;
  });
}

/**
 * Check if an IPv6 address is blocked
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return IPV6_BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Check if a hostname is explicitly blocked
 */
function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return BLOCKED_HOSTNAMES.some(
    (blocked) => lower === blocked || lower.endsWith(`.${blocked}`),
  );
}

/**
 * Validate hostname before DNS resolution
 * @param hostname - The hostname to validate
 * @returns Validation result object
 */
export function validateHostname(hostname: string): ValidationResult {
  // Check if hostname is explicitly blocked
  if (isBlockedHostname(hostname)) {
    const reason = `Hostname "${hostname}" is blocked (metadata/localhost access prevented)`;
    logger.warn({ hostname, reason }, 'SSRF: Hostname validation failed');
    return { allowed: false, reason };
  }

  // Check if hostname is a direct IP address
  const isIPv4 = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  const isIPv6 = /^[0-9a-fA-F:]+$/.test(hostname);

  if (isIPv4) {
    if (isPrivateIPv4(hostname)) {
      const reason = `Direct access to protected IPv4 address "${hostname}" is blocked (localhost/metadata/reserved range)`;
      logger.warn({ hostname, reason }, 'SSRF: IPv4 validation failed');
      return { allowed: false, reason };
    }
  }

  if (isIPv6) {
    if (isPrivateIPv6(hostname)) {
      const reason = `Direct access to protected IPv6 address "${hostname}" is blocked (localhost/link-local/multicast)`;
      logger.warn({ hostname, reason }, 'SSRF: IPv6 validation failed');
      return { allowed: false, reason };
    }
  }

  return { allowed: true };
}

/**
 * Validate resolved IP address after DNS resolution
 * @param hostname - Original hostname that was resolved
 * @param address - The resolved IP address
 * @param family - IP family (4 or 6)
 * @returns Validation result object
 */
export function validateResolvedAddress(
  hostname: string,
  address: string,
  family: number,
): ValidationResult {
  if (family === 4) {
    if (isPrivateIPv4(address)) {
      const reason = `Hostname "${hostname}" resolved to protected IPv4 address "${address}" (localhost/metadata/reserved)`;
      logger.warn(
        { hostname, address, family, reason },
        'SSRF: Resolved address validation failed',
      );
      return { allowed: false, reason };
    }
  } else if (family === 6) {
    if (isPrivateIPv6(address)) {
      const reason = `Hostname "${hostname}" resolved to protected IPv6 address "${address}" (localhost/link-local/multicast)`;
      logger.warn(
        { hostname, address, family, reason },
        'SSRF: Resolved address validation failed',
      );
      return { allowed: false, reason };
    }
  }

  return { allowed: true };
}

/**
 * Validate array of resolved addresses
 * @param hostname - Original hostname that was resolved
 * @param addresses - Array of resolved IP addresses
 * @returns Validation result with optional filtered addresses
 */
export function validateResolvedAddresses(
  hostname: string,
  addresses: string[],
): FilteredAddressResult {
  const filtered: string[] = [];
  const blocked: string[] = [];

  for (const address of addresses) {
    // Try to determine IP version
    const isIPv4 = /^\d+\.\d+\.\d+\.\d+$/.test(address);
    const isIPv6 = /^[0-9a-fA-F:]+$/.test(address);

    if (isIPv4) {
      if (!isPrivateIPv4(address)) {
        filtered.push(address);
      } else {
        blocked.push(address);
      }
    } else if (isIPv6) {
      if (!isPrivateIPv6(address)) {
        filtered.push(address);
      } else {
        blocked.push(address);
      }
    } else {
      // Unknown format, block it
      blocked.push(address);
    }
  }

  // If all addresses were blocked, deny the request
  if (filtered.length === 0) {
    const reason = `All resolved addresses for "${hostname}" are protected/blocked (localhost/metadata/reserved): ${blocked.join(', ')}`;
    logger.warn(
      { hostname, addresses, blocked, reason },
      'SSRF: All resolved addresses blocked',
    );
    return { allowed: false, reason };
  }

  // If some addresses were blocked, log a warning but allow with filtered list
  if (blocked.length > 0) {
    logger.warn(
      { hostname, total: addresses.length, blocked: blocked.length, filtered },
      'SSRF: Some resolved addresses were filtered (protected ranges)',
    );
  }

  return { allowed: true, filteredAddresses: filtered };
}

interface SSRFConfig {
  enabled: boolean;
  privateRanges: string[];
  blockedHostnames: string[];
  ipv6Patterns: string[];
}

/**
 * Get SSRF protection configuration
 */
export function getSSRFConfig(): SSRFConfig {
  return {
    enabled: true,
    privateRanges: PRIVATE_IP_RANGES.map((r) => r.range),
    blockedHostnames: BLOCKED_HOSTNAMES,
    ipv6Patterns: IPV6_BLOCKED_PATTERNS.map((p) => p.source),
  };
}
