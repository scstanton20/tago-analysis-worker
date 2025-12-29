import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createTempStorage, type TempStorage } from '../fixtures/index.ts';

describe('storage', () => {
  let tempStorage: TempStorage;
  let storage: { initializeStorage: () => Promise<void> };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Create fresh temp storage for each test
    tempStorage = createTempStorage();

    // Mock config to use our temp storage paths
    vi.doMock('../../src/config/default.ts', () => ({
      config: {
        storage: {
          base: tempStorage.basePath,
          createDirs: true,
        },
        paths: {
          analysis: join(tempStorage.basePath, 'analyses'),
          logs: join(tempStorage.basePath, 'logs'),
          config: join(tempStorage.basePath, 'config'),
        },
        files: {
          config: join(tempStorage.basePath, 'config', 'config.json'),
        },
      },
    }));

    // Mock logger to suppress output during tests
    vi.doMock('../../src/utils/logging/logger.ts', () => ({
      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    // Import storage module after mocking config
    storage = await import('../../src/utils/storage.ts');
  });

  afterEach(() => {
    tempStorage.cleanup();
    vi.doUnmock('../../src/config/default.ts');
    vi.doUnmock('../../src/utils/logging/logger.ts');
  });

  describe('initializeStorage', () => {
    it('should create base storage directory', async () => {
      await storage.initializeStorage();

      expect(existsSync(tempStorage.basePath)).toBe(true);
    });

    it('should create all configured path directories', async () => {
      await storage.initializeStorage();

      expect(existsSync(join(tempStorage.basePath, 'analyses'))).toBe(true);
      expect(existsSync(join(tempStorage.basePath, 'logs'))).toBe(true);
      expect(existsSync(join(tempStorage.basePath, 'config'))).toBe(true);
    });

    it('should create config file if it does not exist', async () => {
      await storage.initializeStorage();

      const configPath = join(tempStorage.basePath, 'config', 'config.json');
      expect(existsSync(configPath)).toBe(true);

      const configContent = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(configContent.version).toBe('1.0');
    });

    it('should not overwrite config file if it already exists', async () => {
      // Pre-create config file with different content
      const configPath = join(tempStorage.basePath, 'config', 'config.json');
      tempStorage.mkdir('config');
      tempStorage.writeFile(
        'config/config.json',
        JSON.stringify({ version: '2.0', existing: true }),
      );

      await storage.initializeStorage();

      const configContent = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(configContent.version).toBe('2.0');
      expect(configContent.existing).toBe(true);
    });

    it('should include creation timestamp in new config file', async () => {
      await storage.initializeStorage();

      const configPath = join(tempStorage.basePath, 'config', 'config.json');
      const configContent = JSON.parse(readFileSync(configPath, 'utf-8'));

      expect(configContent.created).toBeDefined();
      expect(new Date(configContent.created)).toBeInstanceOf(Date);
    });

    it('should skip initialization when createDirs is false', async () => {
      vi.resetModules();

      // Use paths that tempStorage doesn't pre-create
      const customAnalysisPath = join(tempStorage.basePath, 'custom-analyses');
      const customConfigPath = join(
        tempStorage.basePath,
        'custom-config',
        'config.json',
      );

      vi.doMock('../../src/config/default.ts', () => ({
        config: {
          storage: {
            base: tempStorage.basePath,
            createDirs: false,
          },
          paths: {
            analysis: customAnalysisPath,
          },
          files: {
            config: customConfigPath,
          },
        },
      }));

      const storageNoCreate = await import('../../src/utils/storage.ts');
      await storageNoCreate.initializeStorage();

      // Directories should not exist because createDirs is false
      expect(existsSync(customAnalysisPath)).toBe(false);
      expect(existsSync(customConfigPath)).toBe(false);
    });

    it('should create prettified JSON config', async () => {
      await storage.initializeStorage();

      const configPath = join(tempStorage.basePath, 'config', 'config.json');
      const configContent = readFileSync(configPath, 'utf-8');

      // Verify it's formatted (has newlines and indentation)
      expect(configContent).toContain('\n');
      expect(configContent).toContain('  '); // 2-space indent
    });
  });

  describe('error scenarios', () => {
    it('should throw error on directory creation failure', async () => {
      vi.resetModules();

      // Use an invalid path that will fail
      vi.doMock('../../src/config/default.ts', () => ({
        config: {
          storage: {
            base: '/nonexistent/root/path/that/cannot/be/created',
            createDirs: true,
          },
          paths: {
            analysis: '/nonexistent/root/path/that/cannot/be/created/analyses',
          },
          files: {
            config: '/nonexistent/root/path/that/cannot/be/created/config.json',
          },
        },
      }));

      const freshStorage = await import('../../src/utils/storage.ts');

      await expect(freshStorage.initializeStorage()).rejects.toThrow();
    });
  });

  describe('default export', () => {
    it('should export initializeStorage function', () => {
      expect(storage.initializeStorage).toBeDefined();
      expect(typeof storage.initializeStorage).toBe('function');
    });
  });
});
