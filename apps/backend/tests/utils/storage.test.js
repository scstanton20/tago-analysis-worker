import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs
const mockFsAccess = vi.fn();
vi.mock('fs', () => ({
  promises: {
    access: mockFsAccess,
  },
}));

// Mock config
vi.mock('../../src/config/default.js', () => ({
  config: {
    storage: {
      base: '/app',
      createDirs: true,
    },
    paths: {
      analysis: '/app/analyses-storage',
      logs: '/app/logs',
      config: '/app/config',
    },
    files: {
      config: '/app/config/config.json',
    },
  },
}));

// Mock safePath
const mockSafeMkdir = vi.fn();
const mockSafeWriteFile = vi.fn();

vi.mock('../../src/utils/safePath.js', () => ({
  safeMkdir: mockSafeMkdir,
  safeWriteFile: mockSafeWriteFile,
}));

// Mock logger - create a shared instance to track calls
const mockLogger = {
  error: vi.fn(),
  info: vi.fn(),
};

vi.mock('../../src/utils/logging/logger.js', () => ({
  createChildLogger: vi.fn(() => mockLogger),
}));

describe('storage', () => {
  let storage;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSafeMkdir.mockResolvedValue(undefined);
    mockSafeWriteFile.mockResolvedValue(undefined);
    mockFsAccess.mockRejectedValue(new Error('File not found'));

    // Reset modules to ensure fresh imports with new mock state
    vi.resetModules();
    storage = await import('../../src/utils/storage.js');
  });

  describe('initializeStorage', () => {
    it('should create base storage directory', async () => {
      await storage.initializeStorage();

      expect(mockSafeMkdir).toHaveBeenCalledWith(
        '/app',
        null,
        expect.objectContaining({ recursive: true }),
      );
    });

    it('should create all configured path directories', async () => {
      await storage.initializeStorage();

      expect(mockSafeMkdir).toHaveBeenCalledWith(
        '/app/analyses-storage',
        '/app',
        expect.objectContaining({ recursive: true }),
      );
      expect(mockSafeMkdir).toHaveBeenCalledWith(
        '/app/logs',
        '/app',
        expect.objectContaining({ recursive: true }),
      );
      expect(mockSafeMkdir).toHaveBeenCalledWith(
        '/app/config',
        '/app',
        expect.objectContaining({ recursive: true }),
      );
    });

    it('should create config file if it does not exist', async () => {
      await storage.initializeStorage();

      expect(mockSafeWriteFile).toHaveBeenCalledWith(
        '/app/config/config.json',
        expect.stringContaining('"version": "1.0"'),
        '/app',
      );
    });

    it('should not create config file if it already exists', async () => {
      mockFsAccess.mockResolvedValue(undefined);

      await storage.initializeStorage();

      expect(mockSafeWriteFile).not.toHaveBeenCalled();
    });

    it('should include creation timestamp in new config file', async () => {
      await storage.initializeStorage();

      const configContent = mockSafeWriteFile.mock.calls.find((call) =>
        call[0].includes('config.json'),
      )?.[1];

      expect(configContent).toBeDefined();
      const config = JSON.parse(configContent);
      expect(config.created).toBeDefined();
      expect(new Date(config.created)).toBeInstanceOf(Date);
    });

    it('should use recursive directory creation', async () => {
      await storage.initializeStorage();

      const mkdirCalls = mockSafeMkdir.mock.calls;
      mkdirCalls.forEach((call) => {
        expect(call[2]).toEqual({ recursive: true });
      });
    });

    it('should skip initialization when createDirs is false', async () => {
      vi.doMock('../../src/config/default.js', () => ({
        config: {
          storage: {
            base: '/app',
            createDirs: false,
          },
          paths: {},
          files: {},
        },
      }));

      vi.resetModules();
      const storageNoCreate = await import('../../src/utils/storage.js');

      await storageNoCreate.initializeStorage();

      expect(mockSafeMkdir).not.toHaveBeenCalled();
      expect(mockSafeWriteFile).not.toHaveBeenCalled();

      // Clean up the runtime mock and reset modules
      vi.doUnmock('../../src/config/default.js');
      vi.resetModules();
    });

    it('should throw error on directory creation failure', async () => {
      const error = new Error('Permission denied');
      mockSafeMkdir.mockRejectedValue(error);

      // Need to reset and re-import after changing mock behavior
      vi.resetModules();
      const freshStorage = await import('../../src/utils/storage.js');

      await expect(freshStorage.initializeStorage()).rejects.toThrow(
        'Permission denied',
      );
    });

    it('should log error on failure', async () => {
      const error = new Error('Disk full');
      mockSafeMkdir.mockRejectedValue(error);

      // Reset and re-import after changing mock behavior
      vi.resetModules();
      const freshStorage = await import('../../src/utils/storage.js');

      try {
        await freshStorage.initializeStorage();
      } catch {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle write errors for config file', async () => {
      mockSafeWriteFile.mockRejectedValue(new Error('Write failed'));

      // Reset and re-import after changing mock behavior
      vi.resetModules();
      const freshStorage = await import('../../src/utils/storage.js');

      await expect(freshStorage.initializeStorage()).rejects.toThrow(
        'Write failed',
      );
    });

    it('should create directories in parallel', async () => {
      // Re-mock the config to ensure correct paths after previous test's doMock
      vi.doMock('../../src/config/default.js', () => ({
        config: {
          storage: {
            base: '/app',
            createDirs: true,
          },
          paths: {
            analysis: '/app/analyses-storage',
            logs: '/app/logs',
            config: '/app/config',
          },
          files: {
            config: '/app/config/config.json',
          },
        },
      }));

      const callOrder = [];
      mockSafeMkdir.mockImplementation(async (path) => {
        callOrder.push(path);
        return undefined;
      });

      // Reset and re-import after setting up the mock implementation
      vi.resetModules();
      const freshStorage = await import('../../src/utils/storage.js');

      await freshStorage.initializeStorage();

      // Verify all paths were called (order may vary due to Promise.all)
      expect(callOrder.length).toBeGreaterThanOrEqual(4);
      expect(callOrder).toContain('/app');
      expect(callOrder).toContain('/app/analyses-storage');
      expect(callOrder).toContain('/app/logs');
      expect(callOrder).toContain('/app/config');

      // Clean up
      vi.doUnmock('../../src/config/default.js');
    });
  });

  describe('default export', () => {
    it('should export initializeStorage function', () => {
      expect(storage.initializeStorage).toBeDefined();
      expect(typeof storage.initializeStorage).toBe('function');
    });
  });

  describe('config file format', () => {
    it('should create prettified JSON config', async () => {
      await storage.initializeStorage();

      const configContent = mockSafeWriteFile.mock.calls.find((call) =>
        call[0].includes('config.json'),
      )?.[1];

      expect(configContent).toBeDefined();
      // Verify it's formatted (has newlines and indentation)
      expect(configContent).toContain('\n');
      expect(configContent).toContain('  '); // 2-space indent
    });

    it('should include version in config', async () => {
      await storage.initializeStorage();

      const configContent = mockSafeWriteFile.mock.calls.find((call) =>
        call[0].includes('config.json'),
      )?.[1];

      expect(configContent).toBeDefined();
      const config = JSON.parse(configContent);
      expect(config.version).toBe('1.0');
    });
  });

  describe('error scenarios', () => {
    it('should handle permission errors gracefully', async () => {
      const permError = new Error('EACCES: permission denied');
      permError.code = 'EACCES';
      mockSafeMkdir.mockRejectedValue(permError);

      // Reset and re-import after changing mock behavior
      vi.resetModules();
      const freshStorage = await import('../../src/utils/storage.js');

      await expect(freshStorage.initializeStorage()).rejects.toThrow(
        'permission denied',
      );
    });

    it('should handle disk space errors', async () => {
      const spaceError = new Error('ENOSPC: no space left on device');
      spaceError.code = 'ENOSPC';
      mockSafeWriteFile.mockRejectedValue(spaceError);

      // Reset and re-import after changing mock behavior
      vi.resetModules();
      const freshStorage = await import('../../src/utils/storage.js');

      await expect(freshStorage.initializeStorage()).rejects.toThrow(
        'no space left',
      );
    });

    it('should handle read-only filesystem', async () => {
      const roError = new Error('EROFS: read-only file system');
      roError.code = 'EROFS';
      mockSafeMkdir.mockRejectedValue(roError);

      // Reset and re-import after changing mock behavior
      vi.resetModules();
      const freshStorage = await import('../../src/utils/storage.js');

      await expect(freshStorage.initializeStorage()).rejects.toThrow(
        'read-only',
      );
    });
  });
});
