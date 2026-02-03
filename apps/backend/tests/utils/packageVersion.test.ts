/**
 * Tests for packageVersion utility
 *
 * Tests the package version extraction and caching functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create mock functions
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

// Mock fs module - needs both default and named exports for ES module compatibility
vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

describe('packageVersion utility', () => {
  let getPackageVersion: (packageName: string) => string;

  beforeEach(async () => {
    // Clear module cache to reset caches between tests
    vi.resetModules();
    vi.clearAllMocks();

    // Reset mock defaults
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('');

    // Import the module fresh each test
    const module = await import('../../src/utils/packageVersion.ts');
    getPackageVersion = module.getPackageVersion;
  });

  describe('getPackageVersion', () => {
    describe('successful version extraction', () => {
      it('should extract version from pnpm-lock.yaml', () => {
        // Arrange
        const mockLockfileContent = `packages:
  '@tago-io/sdk':
    specifier: ^12.2.1
    version: 12.2.1
    dependencies:
      axios: 1.6.1`;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('12.2.1');
        expect(mockExistsSync).toHaveBeenCalled();
        expect(mockReadFileSync).toHaveBeenCalled();
      });

      it('should handle different SDK version formats', () => {
        // Arrange - test with beta version
        const mockLockfileContent = `packages:
  '@tago-io/sdk':
    specifier: ^13.0.0-beta.1
    version: 13.0.0-beta.1`;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('13.0.0-beta.1');
      });

      it('should handle versions with pre-release identifiers', () => {
        // Arrange
        const mockLockfileContent = `packages:
  '@tago-io/sdk':
    specifier: ^12.0.0-rc.1
    version: 12.0.0-rc.1`;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('12.0.0-rc.1');
      });

      it('should extract version for non-scoped packages (unquoted)', () => {
        // Arrange - non-scoped packages are not quoted in pnpm-lock.yaml
        const mockLockfileContent = `packages:
      kafkajs:
        specifier: ^2.2.4
        version: 2.2.4`;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const version = getPackageVersion('kafkajs');

        // Assert
        expect(version).toBe('2.2.4');
      });
    });

    describe('caching behavior', () => {
      it('should cache the version after first call', () => {
        // Arrange
        const mockLockfileContent = `packages:
  '@tago-io/sdk':
    specifier: ^12.2.1
    version: 12.2.1`;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act - first call
        const version1 = getPackageVersion('@tago-io/sdk');
        const callCount1 = mockReadFileSync.mock.calls.length;

        // Act - second call
        const version2 = getPackageVersion('@tago-io/sdk');
        const callCount2 = mockReadFileSync.mock.calls.length;

        // Assert - second call should not read file again
        expect(version1).toBe(version2);
        expect(version1).toBe('12.2.1');
        expect(callCount1).toBe(1);
        expect(callCount2).toBe(1); // No additional calls
      });

      it('should return cached version on subsequent calls', () => {
        // Arrange
        const mockLockfileContent = `packages:
  '@tago-io/sdk':
    specifier: ^12.2.1
    version: 12.2.1`;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const v1 = getPackageVersion('@tago-io/sdk');
        const v2 = getPackageVersion('@tago-io/sdk');
        const v3 = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(v1).toBe(v2);
        expect(v2).toBe(v3);
        expect(mockReadFileSync.mock.calls).toHaveLength(1);
      });

      it('should return "unknown" when version not found and cache it', () => {
        // Arrange - lockfile exists but doesn't contain SDK version
        const mockLockfileContent = `packages:
  some-other-package:
    specifier: ^1.0.0
    version: 1.0.0`;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const version1 = getPackageVersion('@tago-io/sdk');
        const version2 = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version1).toBe('unknown');
        expect(version2).toBe('unknown');
        expect(mockReadFileSync).toHaveBeenCalledTimes(1);
      });

      it('should cache lockfile content and reuse for multiple packages', () => {
        // Arrange - scoped packages are quoted, non-scoped are not
        const mockLockfileContent = `packages:
  '@tago-io/sdk':
    specifier: ^12.2.1
    version: 12.2.1
      kafkajs:
        specifier: ^2.2.4
        version: 2.2.4`;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const sdkVersion = getPackageVersion('@tago-io/sdk');
        const kafkaVersion = getPackageVersion('kafkajs');

        // Assert
        expect(sdkVersion).toBe('12.2.1');
        expect(kafkaVersion).toBe('2.2.4');
        expect(mockReadFileSync).toHaveBeenCalledTimes(1); // Only one file read
      });
    });

    describe('error handling', () => {
      it('should return "unknown" when lockfile is not found', () => {
        // Arrange
        mockExistsSync.mockReturnValue(false);

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('unknown');
        expect(mockReadFileSync).not.toHaveBeenCalled();
      });

      it('should handle file read errors gracefully', () => {
        // Arrange
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockImplementation(() => {
          throw new Error('EACCES: permission denied');
        });

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('unknown');
      });

      it('should return unknown on file read error', () => {
        // Arrange
        const readError = new Error('File read failed');
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockImplementation(() => {
          throw readError;
        });

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('unknown');
      });

      it('should cache "unknown" on error for consistency', () => {
        // Arrange
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockImplementation(() => {
          throw new Error('Read error');
        });

        // Act
        const v1 = getPackageVersion('@tago-io/sdk');
        const v2 = getPackageVersion('@tago-io/sdk');

        // Assert - should return cached "unknown"
        expect(v1).toBe('unknown');
        expect(v2).toBe('unknown');
        expect(mockReadFileSync).toHaveBeenCalledTimes(1);
      });
    });

    describe('version extraction edge cases', () => {
      it('should handle lockfile with multiple packages', () => {
        // Arrange
        const mockLockfileContent = `packages:
  axios:
    specifier: ^1.6.0
    version: 1.6.1
  '@tago-io/sdk':
    specifier: ^12.2.1
    version: 12.2.1
  express:
    specifier: ^5.0.0
    version: 5.0.0`;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('12.2.1');
      });

      it('should handle lockfile with extra whitespace', () => {
        // Arrange
        const mockLockfileContent = `packages:
  '@tago-io/sdk':
    specifier:   ^12.2.1
    version:   12.2.1`;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('12.2.1');
      });

      it('should handle empty version value', () => {
        // Arrange
        const mockLockfileContent = `packages:
  '@tago-io/sdk':
    specifier: ^12.2.1
    version: `;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('unknown');
      });

      it('should handle malformed version line', () => {
        // Arrange
        const mockLockfileContent = `packages:
  '@tago-io/sdk':
    specifier: ^12.2.1
    version_mismatch: 12.2.1`;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('unknown');
      });

      it('should handle empty lockfile', () => {
        // Arrange
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('');

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('unknown');
      });

      it('should handle lockfile without packages section', () => {
        // Arrange
        const mockLockfileContent = `lockfileVersion: 5.4
importers:
  .: {}`;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('unknown');
      });
    });

    describe('directory traversal', () => {
      it('should search up directory tree for lockfile', () => {
        // Arrange
        mockExistsSync
          .mockReturnValueOnce(false) // Not in first dir
          .mockReturnValueOnce(false) // Not in second dir
          .mockReturnValueOnce(true); // Found in third dir

        const mockLockfileContent = `packages:
  '@tago-io/sdk':
    specifier: ^12.2.1
    version: 12.2.1`;

        mockReadFileSync.mockReturnValue(mockLockfileContent);

        // Act
        const version = getPackageVersion('@tago-io/sdk');

        // Assert
        expect(version).toBe('12.2.1');
        expect(mockExistsSync).toHaveBeenCalledTimes(3); // Three levels up
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle version check after failed initialization', () => {
      // Arrange - first call fails
      mockExistsSync.mockReturnValue(false);

      // Act - first call
      const v1 = getPackageVersion('@tago-io/sdk');
      expect(v1).toBe('unknown');

      // Arrange - now mock successful scenario
      mockExistsSync.mockReturnValue(true);
      const mockLockfileContent = `packages:
  '@tago-io/sdk':
    specifier: ^12.2.1
    version: 12.2.1`;
      mockReadFileSync.mockReturnValue(mockLockfileContent);

      // Act - second call should still return cached "unknown" (not re-read)
      const v2 = getPackageVersion('@tago-io/sdk');

      // Assert
      expect(v2).toBe('unknown');
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });
  });
});
