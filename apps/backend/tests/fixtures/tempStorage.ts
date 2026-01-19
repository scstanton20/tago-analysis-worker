/* eslint-disable security/detect-non-literal-fs-filename -- test fixture with controlled temp paths */
/**
 * Temp Storage Factory
 *
 * Provides isolated temporary directories for file I/O integration testing.
 * Each test gets its own directory that is automatically cleaned up.
 */

import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * Temp storage instance with helper methods
 */
export interface TempStorage {
  /** Base path of the temporary directory */
  basePath: string;

  /** Path to analyses directory */
  analysesPath: string;

  /** Path to config directory */
  configPath: string;

  /** Path to auth.db (in base directory) */
  authDbPath: string;

  /** Clean up the temporary directory */
  cleanup: () => void;

  /** Create a subdirectory */
  mkdir: (relativePath: string) => string;

  /** Write a file */
  writeFile: (relativePath: string, content: string | Buffer) => string;

  /** Read a file */
  readFile: (relativePath: string) => string;

  /** Check if a file exists */
  exists: (relativePath: string) => boolean;

  /** List directory contents */
  readdir: (relativePath: string) => string[];

  /** Get file stats */
  stat: (relativePath: string) => ReturnType<typeof statSync>;

  /** Get absolute path for a relative path */
  resolve: (relativePath: string) => string;

  /** Create an analysis directory structure */
  createAnalysis: (
    analysisName: string,
    code?: string,
  ) => {
    path: string;
    indexPath: string;
    logsPath: string;
  };

  /** Create a config file */
  createConfig: (config: Record<string, unknown>) => string;

  /** Read the config file */
  readConfig: () => Record<string, unknown>;

  /** Write analysis logs */
  writeLogs: (analysisName: string, logs: string, filename?: string) => string;
}

/**
 * Default analysis code for testing
 */
const DEFAULT_ANALYSIS_CODE = `
const { Analysis } = require('@tago-io/sdk');

async function myAnalysis(context) {
  console.log('Test analysis running');
}

module.exports = new Analysis(myAnalysis);
`;

/**
 * Default config structure
 */
const DEFAULT_CONFIG = {
  version: '5.0',
  analyses: {},
  teamStructure: {},
};

/**
 * Create an isolated temporary storage directory for testing
 *
 * @example
 * ```typescript
 * const storage = createTempStorage();
 *
 * // Create analysis
 * const { path, indexPath } = storage.createAnalysis('my-analysis');
 *
 * // Write config
 * storage.createConfig({ version: '5.0', analyses: {} });
 *
 * // Clean up after test
 * storage.cleanup();
 * ```
 */
export function createTempStorage(prefix = 'tago-test-'): TempStorage {
  const basePath = mkdtempSync(join(tmpdir(), prefix));
  const analysesPath = join(basePath, 'analyses');
  const configPath = join(basePath, 'config');

  // Create default directories
  mkdirSync(analysesPath, { recursive: true });
  mkdirSync(configPath, { recursive: true });

  const storage: TempStorage = {
    basePath,
    analysesPath,
    configPath,
    authDbPath: join(basePath, 'auth.db'),

    cleanup: () => {
      try {
        rmSync(basePath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },

    mkdir: (relativePath: string) => {
      const fullPath = join(basePath, relativePath);
      mkdirSync(fullPath, { recursive: true });
      return fullPath;
    },

    writeFile: (relativePath: string, content: string | Buffer) => {
      const fullPath = join(basePath, relativePath);
      const dir = resolve(fullPath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(fullPath, content);
      return fullPath;
    },

    readFile: (relativePath: string) => {
      const fullPath = join(basePath, relativePath);
      return readFileSync(fullPath, 'utf-8');
    },

    exists: (relativePath: string) => {
      const fullPath = join(basePath, relativePath);
      return existsSync(fullPath);
    },

    readdir: (relativePath: string) => {
      const fullPath = join(basePath, relativePath);
      return readdirSync(fullPath);
    },

    stat: (relativePath: string) => {
      const fullPath = join(basePath, relativePath);
      return statSync(fullPath);
    },

    resolve: (relativePath: string) => {
      return join(basePath, relativePath);
    },

    createAnalysis: (analysisName: string, code?: string) => {
      const analysisPath = join(analysesPath, analysisName);
      const logsPath = join(analysisPath, 'logs');

      mkdirSync(analysisPath, { recursive: true });
      mkdirSync(logsPath, { recursive: true });

      const indexPath = join(analysisPath, 'index.js');
      writeFileSync(indexPath, code ?? DEFAULT_ANALYSIS_CODE);

      return {
        path: analysisPath,
        indexPath,
        logsPath,
      };
    },

    createConfig: (config: Record<string, unknown>) => {
      const configFilePath = join(configPath, 'analyses-config.json');
      const fullConfig = { ...DEFAULT_CONFIG, ...config };
      writeFileSync(configFilePath, JSON.stringify(fullConfig, null, 2));
      return configFilePath;
    },

    readConfig: () => {
      const configFilePath = join(configPath, 'analyses-config.json');
      if (!existsSync(configFilePath)) {
        return { ...DEFAULT_CONFIG };
      }
      return JSON.parse(readFileSync(configFilePath, 'utf-8'));
    },

    writeLogs: (analysisName: string, logs: string, filename = 'out.log') => {
      const logsPath = join(analysesPath, analysisName, 'logs');
      if (!existsSync(logsPath)) {
        mkdirSync(logsPath, { recursive: true });
      }
      const logFilePath = join(logsPath, filename);
      writeFileSync(logFilePath, logs);
      return logFilePath;
    },
  };

  return storage;
}

/**
 * Create a temp storage with pre-created analysis structures
 */
export function createTempStorageWithAnalyses(
  analyses: Array<{
    name: string;
    code?: string;
    teamId?: string;
    enabled?: boolean;
  }>,
): TempStorage & { analysisConfigs: Record<string, unknown> } {
  const storage = createTempStorage();
  const analysisConfigs: Record<string, unknown> = {};

  for (const analysis of analyses) {
    const { path: analysisPath } = storage.createAnalysis(
      analysis.name,
      analysis.code,
    );

    analysisConfigs[analysis.name] = {
      id: `analysis_${analysis.name}`,
      name: analysis.name,
      status: 'stopped',
      enabled: analysis.enabled ?? true,
      teamId: analysis.teamId ?? 'uncategorized',
      path: analysisPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Create config with analyses
  storage.createConfig({
    version: '5.0',
    analyses: analysisConfigs,
    teamStructure: {},
  });

  return {
    ...storage,
    analysisConfigs,
  };
}

/**
 * Vitest helper: Create storage in beforeEach and cleanup in afterEach
 *
 * @example
 * ```typescript
 * describe('my tests', () => {
 *   const { getStorage } = useTempStorage();
 *
 *   it('should work with files', () => {
 *     const storage = getStorage();
 *     storage.writeFile('test.txt', 'hello');
 *     expect(storage.readFile('test.txt')).toBe('hello');
 *   });
 * });
 * ```
 */
export function useTempStorage(): {
  getStorage: () => TempStorage;
  beforeEach: () => void;
  afterEach: () => void;
} {
  let storage: TempStorage | null = null;

  return {
    getStorage: () => {
      if (!storage) {
        throw new Error('Storage not initialized. Call beforeEach first.');
      }
      return storage;
    },
    beforeEach: () => {
      storage = createTempStorage();
    },
    afterEach: () => {
      storage?.cleanup();
      storage = null;
    },
  };
}

export { DEFAULT_ANALYSIS_CODE, DEFAULT_CONFIG };
