import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

type ValidationResult = {
  allowed: boolean;
  reason?: string;
};

type FilteredValidationResult = ValidationResult & {
  filteredAddresses?: string[];
};

type SSRFConfig = {
  enabled: boolean;
  privateRanges: string[];
  blockedHostnames: string[];
  ipv6Patterns: string[];
};

type SSRFProtectionModule = {
  validateHostname: (hostname: string) => ValidationResult;
  validateResolvedAddress: (
    hostname: string,
    address: string,
    family: number,
  ) => ValidationResult;
  validateResolvedAddresses: (
    hostname: string,
    addresses: string[],
  ) => FilteredValidationResult;
  getSSRFConfig: () => SSRFConfig;
};

describe('ssrfProtection', () => {
  let ssrfProtection: SSRFProtectionModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    ssrfProtection = (await import(
      '../../src/utils/ssrfProtection.ts'
    )) as unknown as SSRFProtectionModule;
  });

  describe('validateHostname', () => {
    it('should allow valid public hostnames', () => {
      const result = ssrfProtection.validateHostname('example.com');

      expect(result.allowed).toBe(true);
    });

    it('should allow valid public IPs', () => {
      const result = ssrfProtection.validateHostname('8.8.8.8');

      expect(result.allowed).toBe(true);
    });

    it('should block localhost', () => {
      const result = ssrfProtection.validateHostname('localhost');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('localhost');
    });

    it('should block metadata hostname', () => {
      const result = ssrfProtection.validateHostname('metadata');

      expect(result.allowed).toBe(false);
    });

    it('should block metadata.google.internal', () => {
      const result = ssrfProtection.validateHostname(
        'metadata.google.internal',
      );

      expect(result.allowed).toBe(false);
    });

    it('should block loopback IPs', () => {
      const result = ssrfProtection.validateHostname('127.0.0.1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('127.0.0.1');
    });

    it('should block AWS metadata endpoint', () => {
      const result = ssrfProtection.validateHostname('169.254.169.254');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('169.254.169.254');
    });

    it('should block link-local IPs', () => {
      const result = ssrfProtection.validateHostname('169.254.1.1');

      expect(result.allowed).toBe(false);
    });

    it('should block multicast IPs', () => {
      const result = ssrfProtection.validateHostname('224.0.0.1');

      expect(result.allowed).toBe(false);
    });

    it('should block reserved ranges', () => {
      const result = ssrfProtection.validateHostname('240.0.0.1');

      expect(result.allowed).toBe(false);
    });

    it('should block IPv6 loopback', () => {
      const result = ssrfProtection.validateHostname('::1');

      expect(result.allowed).toBe(false);
    });

    it('should block IPv6 link-local', () => {
      const result = ssrfProtection.validateHostname('fe80::1');

      expect(result.allowed).toBe(false);
    });

    it('should block IPv6 multicast', () => {
      const result = ssrfProtection.validateHostname('ff00::1');

      expect(result.allowed).toBe(false);
    });

    it('should handle IPv4-mapped IPv6 addresses', () => {
      const result = ssrfProtection.validateHostname('::ffff:127.0.0.1');

      // IPv4-mapped addresses with dots don't match simple IPv6 regex, treated as hostname
      expect(result.allowed).toBe(true);
    });

    it('should be case-insensitive for hostnames', () => {
      const result1 = ssrfProtection.validateHostname('LOCALHOST');
      const result2 = ssrfProtection.validateHostname('Metadata');

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(false);
    });

    it('should block subdomain of blocked hostname', () => {
      const result = ssrfProtection.validateHostname('api.localhost');

      expect(result.allowed).toBe(false);
    });
  });

  describe('validateResolvedAddress', () => {
    it('should allow public IPv4 addresses', () => {
      const result = ssrfProtection.validateResolvedAddress(
        'example.com',
        '93.184.216.34',
        4,
      );

      expect(result.allowed).toBe(true);
    });

    it('should block resolved loopback addresses', () => {
      const result = ssrfProtection.validateResolvedAddress(
        'suspicious.com',
        '127.0.0.1',
        4,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('127.0.0.1');
    });

    it('should block resolved link-local addresses', () => {
      const result = ssrfProtection.validateResolvedAddress(
        'evil.com',
        '169.254.169.254',
        4,
      );

      expect(result.allowed).toBe(false);
    });

    it('should allow public IPv6 addresses', () => {
      const result = ssrfProtection.validateResolvedAddress(
        'example.com',
        '2606:2800:220:1:248:1893:25c8:1946',
        6,
      );

      expect(result.allowed).toBe(true);
    });

    it('should block resolved IPv6 loopback', () => {
      const result = ssrfProtection.validateResolvedAddress(
        'evil.com',
        '::1',
        6,
      );

      expect(result.allowed).toBe(false);
    });

    it('should block resolved IPv6 link-local', () => {
      const result = ssrfProtection.validateResolvedAddress(
        'evil.com',
        'fe80::1234',
        6,
      );

      expect(result.allowed).toBe(false);
    });

    it('should include hostname and address in reason', () => {
      const result = ssrfProtection.validateResolvedAddress(
        'test.com',
        '127.0.0.1',
        4,
      );

      expect(result.reason).toContain('test.com');
      expect(result.reason).toContain('127.0.0.1');
    });
  });

  describe('validateResolvedAddresses', () => {
    it('should allow all public addresses', () => {
      const result = ssrfProtection.validateResolvedAddresses('example.com', [
        '93.184.216.34',
        '93.184.216.35',
      ]);

      expect(result.allowed).toBe(true);
      expect(result.filteredAddresses).toHaveLength(2);
    });

    it('should filter out blocked addresses', () => {
      const result = ssrfProtection.validateResolvedAddresses('mixed.com', [
        '93.184.216.34',
        '127.0.0.1',
        '8.8.8.8',
      ]);

      expect(result.allowed).toBe(true);
      expect(result.filteredAddresses).toEqual(['93.184.216.34', '8.8.8.8']);
    });

    it('should block when all addresses are private', () => {
      const result = ssrfProtection.validateResolvedAddresses('evil.com', [
        '127.0.0.1',
        '169.254.169.254',
      ]);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('All resolved addresses');
    });

    it('should handle mixed IPv4 and IPv6 addresses', () => {
      const result = ssrfProtection.validateResolvedAddresses('example.com', [
        '93.184.216.34',
        '2606:2800:220:1:248:1893:25c8:1946',
        '127.0.0.1',
      ]);

      expect(result.allowed).toBe(true);
      expect(result.filteredAddresses).toHaveLength(2);
    });

    it('should block unknown address formats', () => {
      const result = ssrfProtection.validateResolvedAddresses('test.com', [
        'invalid-format',
        '93.184.216.34',
      ]);

      expect(result.allowed).toBe(true);
      expect(result.filteredAddresses).toEqual(['93.184.216.34']);
    });

    it('should block when only unknown formats provided', () => {
      const result = ssrfProtection.validateResolvedAddresses('test.com', [
        'invalid1',
        'invalid2',
      ]);

      expect(result.allowed).toBe(false);
    });

    it('should filter out blocked addresses from list', () => {
      const result = ssrfProtection.validateResolvedAddresses('test.com', [
        '8.8.8.8',
        '127.0.0.1',
      ]);

      // Should filter out the loopback address and keep public one
      expect(result.allowed).toBe(true);
      expect(result.filteredAddresses).toContain('8.8.8.8');
      expect(result.filteredAddresses).not.toContain('127.0.0.1');
    });
  });

  describe('getSSRFConfig', () => {
    it('should return SSRF configuration', () => {
      const config = ssrfProtection.getSSRFConfig();

      expect(config.enabled).toBe(true);
      expect(config.privateRanges).toBeDefined();
      expect(config.blockedHostnames).toBeDefined();
      expect(config.ipv6Patterns).toBeDefined();
    });

    it('should include loopback in private ranges', () => {
      const config = ssrfProtection.getSSRFConfig();

      expect(config.privateRanges).toContain('127.0.0.0/8');
    });

    it('should include link-local in private ranges', () => {
      const config = ssrfProtection.getSSRFConfig();

      expect(config.privateRanges).toContain('169.254.0.0/16');
    });

    it('should include localhost in blocked hostnames', () => {
      const config = ssrfProtection.getSSRFConfig();

      expect(config.blockedHostnames).toContain('localhost');
    });

    it('should include metadata in blocked hostnames', () => {
      const config = ssrfProtection.getSSRFConfig();

      expect(config.blockedHostnames).toContain('metadata');
    });
  });

  describe('edge cases', () => {
    it('should handle empty hostname', () => {
      const result = ssrfProtection.validateHostname('');

      expect(result.allowed).toBe(true);
    });

    it('should handle empty address array', () => {
      const result = ssrfProtection.validateResolvedAddresses('test.com', []);

      expect(result.allowed).toBe(false);
    });

    it('should block malformed IPs', () => {
      const result = ssrfProtection.validateHostname('999.999.999.999');

      // Malformed IPs are detected as IPv4 format and blocked due to overflow
      expect(result.allowed).toBe(false);
    });

    it('should handle IPv4 with less than 4 octets', () => {
      const result = ssrfProtection.validateHostname('192.168.1');

      expect(result.allowed).toBe(true); // Not valid IP format
    });

    it('should handle IPv4 with more than 4 octets', () => {
      const result = ssrfProtection.validateHostname('192.168.1.1.1');

      expect(result.allowed).toBe(true); // Not valid IP format
    });
  });

  describe('comprehensive IP range coverage', () => {
    it('should block all 127.x.x.x addresses', () => {
      const tests = [
        '127.0.0.1',
        '127.0.0.255',
        '127.1.1.1',
        '127.255.255.255',
      ];

      tests.forEach((ip) => {
        const result = ssrfProtection.validateHostname(ip);
        expect(result.allowed).toBe(false);
      });
    });

    it('should block entire link-local range', () => {
      const tests = ['169.254.0.0', '169.254.100.100', '169.254.255.255'];

      tests.forEach((ip) => {
        const result = ssrfProtection.validateHostname(ip);
        expect(result.allowed).toBe(false);
      });
    });

    it('should block multicast range', () => {
      const tests = ['224.0.0.0', '230.1.2.3', '239.255.255.255'];

      tests.forEach((ip) => {
        const result = ssrfProtection.validateHostname(ip);
        expect(result.allowed).toBe(false);
      });
    });

    it('should block reserved/experimental range', () => {
      const tests = ['240.0.0.0', '250.1.2.3', '255.255.255.255'];

      tests.forEach((ip) => {
        const result = ssrfProtection.validateHostname(ip);
        expect(result.allowed).toBe(false);
      });
    });

    it('should block unspecified range', () => {
      const tests = ['0.0.0.0', '0.1.2.3', '0.255.255.255'];

      tests.forEach((ip) => {
        const result = ssrfProtection.validateHostname(ip);
        expect(result.allowed).toBe(false);
      });
    });
  });
});
