import { vi, type Mock } from 'vitest';

/**
 * Mock fs/promises module interface
 */
export interface MockFs {
  readFile: Mock<(path: string) => Promise<string>>;
  writeFile: Mock<(path: string, data: string) => Promise<void>>;
  mkdir: Mock<(path: string, options?: object) => Promise<void>>;
  readdir: Mock<(path: string) => Promise<string[]>>;
  stat: Mock<(path: string) => Promise<MockStats>>;
  unlink: Mock<(path: string) => Promise<void>>;
  rm: Mock<(path: string, options?: object) => Promise<void>>;
  rename: Mock<(oldPath: string, newPath: string) => Promise<void>>;
  access: Mock<(path: string) => Promise<void>>;
}

/**
 * Mock fs module (non-promises) interface
 */
export interface MockFsSync {
  readFileSync: Mock<(path: string) => string>;
  writeFileSync: Mock<(path: string, data: string) => void>;
  mkdirSync: Mock<(path: string, options?: object) => void>;
  readdirSync: Mock<(path: string) => string[]>;
  statSync: Mock<(path: string) => MockStats>;
  unlinkSync: Mock<(path: string) => void>;
  renameSync: Mock<(oldPath: string, newPath: string) => void>;
  accessSync: Mock<(path: string) => void>;
  existsSync: Mock<(path: string) => boolean>;
}

/**
 * Mock file stats object interface
 */
export interface MockStats {
  isFile: Mock<() => boolean>;
  isDirectory: Mock<() => boolean>;
  isSymbolicLink: Mock<() => boolean>;
  size: number;
  birthtime: Date;
  mtime: Date;
  atime: Date;
  ctime: Date;
}

/**
 * Create mock fs/promises module
 * @param overrides - Methods to override
 * @returns Mock fs/promises
 */
export function createMockFs(overrides: Partial<MockFs> = {}): MockFs {
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
 * @param overrides - Methods to override
 * @returns Mock fs
 */
export function createMockFsSync(
  overrides: Partial<MockFsSync> = {},
): MockFsSync {
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
 * @param overrides - Properties to override
 * @returns Mock stats object
 */
export function createMockStats(overrides: Partial<MockStats> = {}): MockStats {
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
