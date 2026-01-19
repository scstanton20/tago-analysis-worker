/* eslint-disable security/detect-non-literal-fs-filename -- integration test with controlled temp paths */
/**
 * Storage Integration Tests
 *
 * Demonstrates testing with real file system operations using temp directories.
 * These tests verify actual file I/O without mocking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  createTempStorage,
  createTempStorageWithAnalyses,
  type TempStorage,
} from '../fixtures/index.js';

describe('Storage Integration', () => {
  let storage: TempStorage;

  beforeEach(() => {
    storage = createTempStorage();
  });

  afterEach(() => {
    storage.cleanup();
  });

  describe('Directory Structure', () => {
    it('should create base directory structure', () => {
      expect(existsSync(storage.basePath)).toBe(true);
      expect(existsSync(storage.analysesPath)).toBe(true);
      expect(existsSync(storage.configPath)).toBe(true);
    });

    it('should create isolated temp directories', () => {
      const storage2 = createTempStorage();

      try {
        expect(storage.basePath).not.toBe(storage2.basePath);
        expect(existsSync(storage.basePath)).toBe(true);
        expect(existsSync(storage2.basePath)).toBe(true);
      } finally {
        storage2.cleanup();
      }
    });

    it('should create subdirectories', () => {
      const subdir = storage.mkdir('custom/nested/path');

      expect(existsSync(subdir)).toBe(true);
      expect(subdir).toContain(storage.basePath);
    });
  });

  describe('File Operations', () => {
    it('should write and read files', () => {
      const content = 'Hello, test!';
      storage.writeFile('test.txt', content);

      const read = storage.readFile('test.txt');

      expect(read).toBe(content);
    });

    it('should write files in nested directories', () => {
      storage.writeFile('nested/deep/file.json', '{"key": "value"}');

      expect(storage.exists('nested/deep/file.json')).toBe(true);

      const read = storage.readFile('nested/deep/file.json');
      expect(JSON.parse(read)).toEqual({ key: 'value' });
    });

    it('should check file existence', () => {
      expect(storage.exists('nonexistent.txt')).toBe(false);

      storage.writeFile('exists.txt', 'content');

      expect(storage.exists('exists.txt')).toBe(true);
    });

    it('should list directory contents', () => {
      storage.writeFile('file1.txt', 'a');
      storage.writeFile('file2.txt', 'b');
      storage.mkdir('subdir');

      const contents = storage.readdir('.');

      expect(contents).toContain('file1.txt');
      expect(contents).toContain('file2.txt');
      expect(contents).toContain('subdir');
    });

    it('should get file stats', () => {
      const content = 'Test content with some length';
      storage.writeFile('stats.txt', content);

      const stats = storage.stat('stats.txt');

      expect(stats).toBeDefined();
      expect(stats!.isFile()).toBe(true);
      expect(stats!.size).toBe(content.length);
    });
  });

  describe('Analysis Structure', () => {
    it('should create analysis directory with required structure', () => {
      const {
        path: analysisPath,
        indexPath,
        logsPath,
      } = storage.createAnalysis('my-analysis');

      expect(existsSync(analysisPath)).toBe(true);
      expect(existsSync(indexPath)).toBe(true);
      expect(existsSync(logsPath)).toBe(true);

      // index.js should have default code
      const code = readFileSync(indexPath, 'utf-8');
      expect(code).toContain('Analysis');
    });

    it('should create analysis with custom code', () => {
      const customCode = `
        console.log('Custom analysis');
        module.exports = {};
      `;

      const { indexPath } = storage.createAnalysis('custom', customCode);

      const code = readFileSync(indexPath, 'utf-8');
      expect(code).toBe(customCode);
    });

    it('should write analysis logs', () => {
      storage.createAnalysis('logging-test');

      const logContent =
        '[2025-01-01] Test log entry\n[2025-01-01] Another entry';
      storage.writeLogs('logging-test', logContent);

      const logPath = join(
        storage.analysesPath,
        'logging-test',
        'logs',
        'out.log',
      );
      expect(existsSync(logPath)).toBe(true);

      const readLog = readFileSync(logPath, 'utf-8');
      expect(readLog).toBe(logContent);
    });

    it('should write logs with custom filename', () => {
      storage.createAnalysis('custom-log');

      storage.writeLogs('custom-log', 'error content', 'error.log');

      const errorLogPath = join(
        storage.analysesPath,
        'custom-log',
        'logs',
        'error.log',
      );
      expect(existsSync(errorLogPath)).toBe(true);
    });
  });

  describe('Config Operations', () => {
    it('should create config with default values', () => {
      storage.createConfig({});

      const config = storage.readConfig();

      expect(config.version).toBe('5.0');
      expect(config.analyses).toEqual({});
      expect(config.teamStructure).toEqual({});
    });

    it('should create config with custom values', () => {
      storage.createConfig({
        analyses: {
          'test-analysis': {
            id: 'test-123',
            name: 'Test Analysis',
            status: 'running',
          },
        },
        teamStructure: {
          'team-1': { items: [] },
        },
      });

      const config = storage.readConfig();

      expect(config.analyses).toHaveProperty('test-analysis');
      expect(config.teamStructure).toHaveProperty('team-1');
    });

    it('should read non-existent config with defaults', () => {
      // Don't create config

      const config = storage.readConfig();

      expect(config.version).toBe('5.0');
      expect(config.analyses).toEqual({});
    });
  });

  describe('Pre-seeded Storage', () => {
    it('should create storage with analyses', () => {
      const seededStorage = createTempStorageWithAnalyses([
        { name: 'analysis-1', teamId: 'team-1' },
        { name: 'analysis-2', teamId: 'team-2', enabled: false },
      ]);

      try {
        // Verify analyses created
        expect(
          existsSync(
            join(seededStorage.analysesPath, 'analysis-1', 'index.js'),
          ),
        ).toBe(true);
        expect(
          existsSync(
            join(seededStorage.analysesPath, 'analysis-2', 'index.js'),
          ),
        ).toBe(true);

        // Verify config
        const config = seededStorage.readConfig();
        expect(config.analyses).toHaveProperty('analysis-1');
        expect(config.analyses).toHaveProperty('analysis-2');

        // Verify analysis configs
        expect(seededStorage.analysisConfigs['analysis-1']).toMatchObject({
          name: 'analysis-1',
          teamId: 'team-1',
          enabled: true,
        });
        expect(seededStorage.analysisConfigs['analysis-2']).toMatchObject({
          name: 'analysis-2',
          teamId: 'team-2',
          enabled: false,
        });
      } finally {
        seededStorage.cleanup();
      }
    });

    it('should create analyses with custom code', () => {
      const customCode = 'console.log("Custom!");';

      const seededStorage = createTempStorageWithAnalyses([
        { name: 'custom-analysis', code: customCode },
      ]);

      try {
        const indexPath = join(
          seededStorage.analysesPath,
          'custom-analysis',
          'index.js',
        );
        const code = readFileSync(indexPath, 'utf-8');

        expect(code).toBe(customCode);
      } finally {
        seededStorage.cleanup();
      }
    });
  });

  describe('Cleanup', () => {
    it('should clean up all files on cleanup()', () => {
      storage.createAnalysis('temp-analysis');
      storage.createConfig({ test: true });
      storage.writeFile('extra.txt', 'data');

      const basePath = storage.basePath;

      // Cleanup
      storage.cleanup();

      // Directory should be gone
      expect(existsSync(basePath)).toBe(false);
    });
  });

  describe('Path Resolution', () => {
    it('should resolve relative paths', () => {
      const resolved = storage.resolve('nested/path/file.txt');

      expect(resolved).toBe(join(storage.basePath, 'nested/path/file.txt'));
    });

    it('should have correct analysis path', () => {
      expect(storage.analysesPath).toBe(join(storage.basePath, 'analyses'));
    });

    it('should have correct config path', () => {
      expect(storage.configPath).toBe(join(storage.basePath, 'config'));
    });

    it('should have correct auth db path', () => {
      expect(storage.authDbPath).toBe(join(storage.basePath, 'auth.db'));
    });
  });
});
