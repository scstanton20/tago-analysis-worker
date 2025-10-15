import { vi } from 'vitest';

/**
 * Create mock fs/promises module
 * @param {Object} overrides - Methods to override
 * @returns {Object} Mock fs/promises
 */
export function createMockFs(overrides = {}) {
  return {
    readFile: vi.fn().mockResolvedValue('mock file content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({
      isFile: () => true,
      isDirectory: () => false,
      size: 1024,
      birthtime: new Date(),
      mtime: new Date(),
    }),
    unlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Create mock fs module (non-promises)
 * @param {Object} overrides - Methods to override
 * @returns {Object} Mock fs
 */
export function createMockFsSync(overrides = {}) {
  return {
    readFileSync: vi.fn().mockReturnValue('mock file content'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
      size: 1024,
      birthtime: new Date(),
      mtime: new Date(),
    }),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
    accessSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

/**
 * Create a mock file stats object
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock stats object
 */
export function createMockStats(overrides = {}) {
  return {
    isFile: vi.fn().mockReturnValue(true),
    isDirectory: vi.fn().mockReturnValue(false),
    isSymbolicLink: vi.fn().mockReturnValue(false),
    size: 1024,
    birthtime: new Date('2025-01-01'),
    mtime: new Date('2025-01-01'),
    atime: new Date('2025-01-01'),
    ctime: new Date('2025-01-01'),
    ...overrides,
  };
}
