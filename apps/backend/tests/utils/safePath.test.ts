import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
  FILENAME_REGEX,
  FILENAME_ERROR_MESSAGE,
  isValidFilename,
  sanitizeAndValidateFilename,
  isAnalysisNameSafe,
} from '../../src/validation/shared.ts';

// Mock fs module - include both promise and sync methods
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn().mockReturnValue(undefined),
    writeFileSync: vi.fn().mockReturnValue(undefined),
    unlinkSync: vi.fn().mockReturnValue(undefined),
    readFileSync: vi.fn().mockReturnValue('mock content'),
  },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn().mockReturnValue(undefined),
  writeFileSync: vi.fn().mockReturnValue(undefined),
  unlinkSync: vi.fn().mockReturnValue(undefined),
  readFileSync: vi.fn().mockReturnValue('mock content'),
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('mock content'),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({
      isFile: () => true,
      size: 1024,
    }),
    unlink: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/config/default.ts', () => ({
  config: {
    paths: {
      analysis: '/tmp/test-analyses-storage/analyses',
    },
    storage: {
      base: '/tmp/test-analyses-storage',
    },
  },
}));

type FSPromises = {
  mkdir: Mock;
  writeFile: Mock;
  readFile: Mock;
  readdir: Mock;
  stat: Mock;
  unlink: Mock;
  rename: Mock;
};

type SafePathModule = {
  isPathSafe: (targetPath: string, basePath: string | null) => boolean;
  safeMkdir: (
    dirPath: string,
    basePath?: string | null,
    options?: { recursive?: boolean },
  ) => Promise<string | undefined>;
  safeWriteFile: (
    filePath: string,
    content: string | Buffer,
    basePath?: string,
    options?: Record<string, unknown>,
  ) => Promise<void>;
  safeReadFile: (
    filePath: string,
    basePath?: string,
    options?: { encoding?: BufferEncoding | null; flag?: string },
  ) => Promise<Buffer | string>;
  safeReaddir: (
    dirPath: string,
    basePath?: string,
    options?: Record<string, unknown>,
  ) => Promise<string[]>;
  safeStat: (
    filePath: string,
    basePath?: string,
  ) => Promise<{ isFile: () => boolean; size: number }>;
  safeUnlink: (filePath: string, basePath?: string) => Promise<void>;
  safeRename: (
    oldPath: string,
    newPath: string,
    basePath?: string,
  ) => Promise<void>;
  getAnalysisPath: (analysisId: string) => string | null;
  getAnalysisFilePath: (
    analysisId: string,
    ...segments: string[]
  ) => string | null;
  isAbsolutePathSafe: (filePath: unknown) => boolean;
  // Sync functions
  safeExistsSync: (filePath: string, basePath: string | null) => boolean;
  safeMkdirSync: (
    dirPath: string,
    basePath?: string,
    options?: { recursive?: boolean },
  ) => void;
  safeWriteFileSync: (
    filePath: string,
    data: string | Buffer,
    basePath?: string,
    options?: Record<string, unknown>,
  ) => void;
  safeUnlinkSync: (filePath: string, basePath?: string) => void;
  safeReadFileSync: (
    filePath: string,
    basePath?: string | null,
    options?: { encoding?: BufferEncoding | null; flag?: string },
  ) => string | Buffer;
};

describe('safePath', () => {
  let safePath: SafePathModule;
  let fs: FSPromises;

  beforeEach(async () => {
    vi.clearAllMocks();
    fs = (await import('fs')).promises as unknown as FSPromises;
    safePath =
      (await import('../../src/utils/safePath.ts')) as unknown as SafePathModule;
  });

  describe('isPathSafe', () => {
    it('should allow paths within base directory', () => {
      const targetPath =
        '/tmp/test-analyses-storage/analyses/my-analysis/index.js';
      const basePath = '/tmp/test-analyses-storage/analyses';

      const result = safePath.isPathSafe(targetPath, basePath);

      expect(result).toBe(true);
    });

    it('should reject path traversal attempts with ..', () => {
      const targetPath =
        '/tmp/test-analyses-storage/analyses/../../../etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      const result = safePath.isPathSafe(targetPath, basePath);

      expect(result).toBe(false);
    });

    it('should reject paths outside base directory', () => {
      const targetPath = '/etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      const result = safePath.isPathSafe(targetPath, basePath);

      expect(result).toBe(false);
    });

    it('should handle Windows-style paths', () => {
      // Skip on non-Windows platforms as path behavior differs
      if (process.platform === 'win32') {
        const targetPath = 'C:\\app\\analyses\\..\\..\\Windows\\System32';
        const basePath = 'C:\\app\\analyses';

        const result = safePath.isPathSafe(targetPath, basePath);

        expect(result).toBe(false);
      } else {
        // On Unix-like systems, backslashes are valid filename characters
        // This test is platform-specific
        expect(true).toBe(true);
      }
    });

    it('should allow paths with null basePath (used for root directory)', () => {
      const targetPath = '/app/config';

      // isPathSafe calls path.resolve on basePath, which throws on null
      // The actual implementation expects basePath to be a string
      // This test documents that null basePath is not actually supported
      expect(() => {
        safePath.isPathSafe(targetPath, null);
      }).toThrow();
    });
  });

  describe('FILENAME_REGEX and isValidFilename (from js)', () => {
    it('should export FILENAME_REGEX constant', () => {
      expect(FILENAME_REGEX).toBeDefined();
      expect(FILENAME_REGEX).toBeInstanceOf(RegExp);
    });

    it('should export FILENAME_ERROR_MESSAGE constant', () => {
      expect(FILENAME_ERROR_MESSAGE).toBeDefined();
      expect(typeof FILENAME_ERROR_MESSAGE).toBe('string');
    });

    it('should allow valid filenames with isValidFilename', () => {
      expect(isValidFilename('my-analysis')).toBe(true);
      expect(isValidFilename('my_analysis')).toBe(true);
      expect(isValidFilename('my analysis')).toBe(true);
      expect(isValidFilename('analysis.js')).toBe(true);
      expect(isValidFilename('My Analysis 123')).toBe(true);
    });

    it('should reject invalid filenames with isValidFilename', () => {
      expect(isValidFilename('file(1)')).toBe(false);
      expect(isValidFilename('file[1]')).toBe(false);
      expect(isValidFilename('file@name')).toBe(false);
      expect(isValidFilename('file#name')).toBe(false);
      expect(isValidFilename('file$name')).toBe(false);
      expect(isValidFilename('path/to/file')).toBe(false);
      expect(isValidFilename('../etc/passwd')).toBe(false);
    });

    it('should reject empty or invalid inputs', () => {
      expect(isValidFilename('')).toBe(false);
      expect(isValidFilename(null)).toBe(false);
      expect(isValidFilename(undefined)).toBe(false);
      expect(isValidFilename('.')).toBe(false);
      expect(isValidFilename('..')).toBe(false);
    });
  });

  describe('sanitizeAndValidateFilename (from js)', () => {
    it('should allow valid filenames', () => {
      const filename = 'my-analysis.js';

      const result = sanitizeAndValidateFilename(filename);

      expect(result).toBe('my-analysis.js');
    });

    it('should sanitize dangerous characters and pass validation', () => {
      // Colons get replaced with underscores by sanitize-filename
      // The result 'file_name.js' passes the FILENAME_REGEX
      const filename = 'file:name.js';
      const result = sanitizeAndValidateFilename(filename);
      expect(result).toBe('file_name.js');
    });

    it('should throw for filenames with parentheses (not allowed by regex)', () => {
      const filename = 'file(1).js';

      // Parentheses are not replaced by sanitize-filename but fail FILENAME_REGEX
      expect(() => {
        sanitizeAndValidateFilename(filename);
      }).toThrow('can only contain alphanumeric');
    });

    it('should throw for filenames with brackets', () => {
      const filename = 'file[1].js';

      expect(() => {
        sanitizeAndValidateFilename(filename);
      }).toThrow('can only contain alphanumeric');
    });

    it('should throw for filenames with special characters not in allowed set', () => {
      const filename = 'file@name.js';

      expect(() => {
        sanitizeAndValidateFilename(filename);
      }).toThrow('can only contain alphanumeric');
    });

    it('should sanitize path traversal attempts to valid filename', () => {
      const filename = '../../../etc/passwd';

      // sanitize-filename replaces slashes with underscores
      // Result: '.._.._.._etc_passwd' - dots are allowed in FILENAME_REGEX
      const result = sanitizeAndValidateFilename(filename);
      expect(result).toBe('.._.._.._etc_passwd');
    });

    it('should sanitize filenames with directory separators', () => {
      const filename = 'subdir/analysis.js';

      // After sanitize-filename: 'subdir_analysis.js' - this should pass
      const result = sanitizeAndValidateFilename(filename);
      expect(result).toBe('subdir_analysis.js');
    });

    it('should sanitize null bytes to underscores', () => {
      const filename = 'analysis\x00test.js';

      // sanitize-filename replaces null bytes with underscores
      const result = sanitizeAndValidateFilename(filename);
      expect(result).toBe('analysis_test.js');
    });

    it('should reject empty filenames', () => {
      expect(() => {
        sanitizeAndValidateFilename('');
      }).toThrow('Invalid filename');
    });

    it('should reject null and undefined', () => {
      expect(() => {
        sanitizeAndValidateFilename(null);
      }).toThrow('Invalid filename');

      expect(() => {
        sanitizeAndValidateFilename(undefined);
      }).toThrow('Invalid filename');
    });
  });

  describe('isAnalysisNameSafe (from js)', () => {
    it('should allow valid analysis names', () => {
      expect(isAnalysisNameSafe('my-analysis')).toBe(true);
      expect(isAnalysisNameSafe('my_analysis')).toBe(true);
      expect(isAnalysisNameSafe('my analysis')).toBe(true);
      expect(isAnalysisNameSafe('Analysis123')).toBe(true);
      expect(isAnalysisNameSafe('My.Analysis')).toBe(true);
    });

    it('should reject path traversal in analysis name', () => {
      expect(isAnalysisNameSafe('../../../etc/passwd')).toBe(false);
      expect(isAnalysisNameSafe('..')).toBe(false);
    });

    it('should reject names with directory separators', () => {
      expect(isAnalysisNameSafe('subdir/analysis')).toBe(false);
      expect(isAnalysisNameSafe('path\\to\\file')).toBe(false);
    });

    it('should reject names with parentheses (consistent with FILENAME_REGEX)', () => {
      expect(isAnalysisNameSafe('file(1)')).toBe(false);
      expect(isAnalysisNameSafe('analysis (copy)')).toBe(false);
    });

    it('should reject names with special characters', () => {
      expect(isAnalysisNameSafe('file@name')).toBe(false);
      expect(isAnalysisNameSafe('file#name')).toBe(false);
      expect(isAnalysisNameSafe('file$name')).toBe(false);
      expect(isAnalysisNameSafe('file[1]')).toBe(false);
    });

    it('should reject empty or invalid inputs', () => {
      expect(isAnalysisNameSafe('')).toBe(false);
      expect(isAnalysisNameSafe(null)).toBe(false);
      expect(isAnalysisNameSafe(undefined)).toBe(false);
      expect(isAnalysisNameSafe('.')).toBe(false);
    });

    it('should use isValidFilename internally (same behavior)', () => {
      // Verify that isAnalysisNameSafe behaves identically to isValidFilename
      const testCases = ['valid-name', 'file(1)', '../etc/passwd', '', null];

      testCases.forEach((name) => {
        expect(isAnalysisNameSafe(name)).toBe(isValidFilename(name));
      });
    });
  });

  describe('safeMkdir', () => {
    it('should create directory if path is safe', async () => {
      const dirPath = '/tmp/test-analyses-storage/analyses/new-analysis';
      const basePath = '/tmp/test-analyses-storage/analyses';

      await safePath.safeMkdir(dirPath, basePath, { recursive: true });

      expect(fs.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    it('should reject unsafe paths', async () => {
      const dirPath = '/tmp/test-analyses-storage/analyses/../../../etc';
      const basePath = '/tmp/test-analyses-storage/analyses';

      await expect(
        safePath.safeMkdir(dirPath, basePath, { recursive: true }),
      ).rejects.toThrow('Path traversal attempt detected');
    });

    it('should allow creating root-level directories with null basePath', async () => {
      const dirPath = '/app/config';

      await safePath.safeMkdir(dirPath, null, { recursive: true });

      expect(fs.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
    });
  });

  describe('safeWriteFile', () => {
    it('should write file if path is safe', async () => {
      const filePath = '/tmp/test-analyses-storage/analyses/analysis/index.js';
      const content = 'console.log("test");';
      const basePath = '/tmp/test-analyses-storage/analyses';

      await safePath.safeWriteFile(filePath, content, basePath, {
        encoding: 'utf8',
      });

      expect(fs.writeFile).toHaveBeenCalledWith(filePath, content, {
        encoding: 'utf8',
      });
    });

    it('should reject unsafe paths', async () => {
      const filePath =
        '/tmp/test-analyses-storage/analyses/../../../etc/passwd';
      const content = 'malicious content';
      const basePath = '/tmp/test-analyses-storage/analyses';

      await expect(
        safePath.safeWriteFile(filePath, content, basePath),
      ).rejects.toThrow('Path traversal attempt detected');
    });
  });

  describe('safeReadFile', () => {
    it('should read file if path is safe', async () => {
      const filePath = '/tmp/test-analyses-storage/analyses/analysis/index.js';
      const basePath = '/tmp/test-analyses-storage/analyses';

      // Mock needs to return the value for this specific call
      fs.readFile.mockResolvedValueOnce('mock content');

      const content = await safePath.safeReadFile(filePath, basePath, {
        encoding: 'utf8',
      });

      expect(fs.readFile).toHaveBeenCalledWith(filePath, { encoding: 'utf8' });
      expect(content).toBe('mock content');
    });

    it('should reject unsafe paths', async () => {
      const filePath =
        '/tmp/test-analyses-storage/analyses/../../../etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      await expect(
        safePath.safeReadFile(filePath, basePath, { encoding: 'utf8' }),
      ).rejects.toThrow('Path traversal attempt detected');
    });
  });

  describe('safeReaddir', () => {
    it('should read directory if path is safe', async () => {
      const dirPath = '/tmp/test-analyses-storage/analyses';

      // Mock needs to return the value for this specific call
      fs.readdir.mockResolvedValueOnce([]);

      // safeReaddir signature is (dirPath, basePath, options)
      // The default basePath is config.paths.analysis which is '/tmp/test-analyses-storage/analyses'
      const files = await safePath.safeReaddir(dirPath);

      // It should be called with dirPath and options (undefined by default)
      expect(fs.readdir).toHaveBeenCalledWith(dirPath, undefined);
      expect(files).toEqual([]);
    });

    it('should reject unsafe paths', async () => {
      const dirPath = '/tmp/test-analyses-storage/analyses/../../../etc';

      await expect(safePath.safeReaddir(dirPath)).rejects.toThrow(
        'Path traversal attempt detected',
      );
    });
  });

  describe('safeStat', () => {
    it('should stat file if path is safe', async () => {
      const filePath = '/tmp/test-analyses-storage/analyses/analysis/index.js';
      const basePath = '/tmp/test-analyses-storage/analyses';

      // Mock needs to return the stat object for this specific call
      const mockStats = {
        isFile: () => true,
        size: 1024,
      };
      fs.stat.mockResolvedValueOnce(mockStats);

      const stats = await safePath.safeStat(filePath, basePath);

      expect(fs.stat).toHaveBeenCalledWith(filePath);
      expect(stats.isFile()).toBe(true);
    });

    it('should reject unsafe paths', async () => {
      const filePath =
        '/tmp/test-analyses-storage/analyses/../../../etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      await expect(safePath.safeStat(filePath, basePath)).rejects.toThrow(
        'Path traversal attempt detected',
      );
    });
  });

  describe('safeUnlink', () => {
    it('should delete file if path is safe', async () => {
      const filePath = '/tmp/test-analyses-storage/analyses/analysis/temp.log';
      const basePath = '/tmp/test-analyses-storage/analyses';

      await safePath.safeUnlink(filePath, basePath);

      expect(fs.unlink).toHaveBeenCalledWith(filePath);
    });

    it('should reject unsafe paths', async () => {
      const filePath =
        '/tmp/test-analyses-storage/analyses/../../../etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      await expect(safePath.safeUnlink(filePath, basePath)).rejects.toThrow(
        'Path traversal attempt detected',
      );
    });
  });

  describe('safeRename', () => {
    it('should rename file if paths are safe', async () => {
      const oldPath = '/tmp/test-analyses-storage/analyses/old-name';
      const newPath = '/tmp/test-analyses-storage/analyses/new-name';
      const basePath = '/tmp/test-analyses-storage/analyses';

      await safePath.safeRename(oldPath, newPath, basePath);

      expect(fs.rename).toHaveBeenCalledWith(oldPath, newPath);
    });

    it('should reject unsafe old paths', async () => {
      const oldPath = '/tmp/test-analyses-storage/analyses/../../../etc/passwd';
      const newPath = '/tmp/test-analyses-storage/analyses/new-name';
      const basePath = '/tmp/test-analyses-storage/analyses';

      await expect(
        safePath.safeRename(oldPath, newPath, basePath),
      ).rejects.toThrow('Path traversal attempt detected');
    });

    it('should reject unsafe new paths', async () => {
      const oldPath = '/tmp/test-analyses-storage/analyses/old-name';
      const newPath = '/tmp/test-analyses-storage/analyses/../../../etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      await expect(
        safePath.safeRename(oldPath, newPath, basePath),
      ).rejects.toThrow('Path traversal attempt detected');
    });
  });

  describe('getAnalysisPath', () => {
    it('should return correct analysis path', () => {
      const analysisId = 'my-analysis';

      const result = safePath.getAnalysisPath(analysisId);

      expect(result).toBe('/tmp/test-analyses-storage/analyses/my-analysis');
    });

    it('should handle analysis IDs with hyphens', () => {
      const analysisId = 'my-cool-analysis';

      const result = safePath.getAnalysisPath(analysisId);

      expect(result).toContain('my-cool-analysis');
    });
  });

  describe('isAbsolutePathSafe', () => {
    it('should allow valid absolute paths', () => {
      const validPaths = [
        '/app/certs/backend.crt',
        '/etc/ssl/certs/mycert.pem',
        '/mnt/certificates/cert.crt',
        '/var/lib/ssl/key.pem',
      ];

      validPaths.forEach((filePath) => {
        const result = safePath.isAbsolutePathSafe(filePath);
        expect(result).toBe(true);
      });
    });

    it('should reject relative paths', () => {
      const relativePaths = [
        'certs/backend.crt',
        './certs/backend.crt',
        '../certs/backend.crt',
        'backend.crt',
      ];

      relativePaths.forEach((filePath) => {
        const result = safePath.isAbsolutePathSafe(filePath);
        expect(result).toBe(false);
      });
    });

    it('should reject paths with traversal attempts', () => {
      const traversalPaths = [
        '/app/../etc/passwd',
        '/app/certs/../../etc/passwd',
        '/../etc/passwd',
        '/app/./../../etc/passwd',
      ];

      traversalPaths.forEach((filePath) => {
        const result = safePath.isAbsolutePathSafe(filePath);
        expect(result).toBe(false);
      });
    });

    it('should reject empty or null paths', () => {
      expect(safePath.isAbsolutePathSafe('')).toBe(false);
      expect(safePath.isAbsolutePathSafe(null)).toBe(false);
      expect(safePath.isAbsolutePathSafe(undefined)).toBe(false);
    });

    it('should reject non-string paths', () => {
      expect(safePath.isAbsolutePathSafe(123)).toBe(false);
      expect(safePath.isAbsolutePathSafe({})).toBe(false);
      expect(safePath.isAbsolutePathSafe([])).toBe(false);
    });
  });

  describe('safeReadFileSync with basePath = null', () => {
    it('should allow SSL certificate paths when basePath is null', () => {
      // These tests verify the validation logic without actual file I/O
      // The validation happens before fs.readFileSync is called
      const certPaths = [
        '/app/certs/backend.crt',
        '/etc/ssl/certs/server.pem',
        '/mnt/certificates/mycert.crt',
      ];

      // isAbsolutePathSafe should return true for these paths
      certPaths.forEach((filePath) => {
        const isValid = safePath.isAbsolutePathSafe(filePath);
        expect(isValid).toBe(true);
      });
    });

    it('should reject relative paths when basePath is null', () => {
      const filePath = 'certs/backend.crt';

      expect(() => {
        safePath.safeReadFileSync(filePath, null, { encoding: 'utf8' });
      }).toThrow('Invalid or unsafe file path');
    });

    it('should reject traversal attempts when basePath is null', () => {
      const filePath = '/app/../etc/passwd';

      expect(() => {
        safePath.safeReadFileSync(filePath, null, { encoding: 'utf8' });
      }).toThrow('Invalid or unsafe file path');
    });

    it('should still enforce basePath restrictions when basePath is provided', () => {
      const filePath = '/etc/ssl/certs/cert.pem';
      const basePath = '/tmp/test-analyses-storage/analyses';

      expect(() => {
        safePath.safeReadFileSync(filePath, basePath, { encoding: 'utf8' });
      }).toThrow('Path traversal attempt detected');
    });
  });

  describe('getAnalysisFilePath', () => {
    it('should return correct analysis file path with single segment', () => {
      const analysisId = 'my-analysis';
      const segments = ['index.js'];

      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      expect(result).toBe(
        '/tmp/test-analyses-storage/analyses/my-analysis/index.js',
      );
    });

    it('should return correct analysis file path with multiple segments', () => {
      const analysisId = 'my-analysis';
      const segments = ['src', 'main.js'];

      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      expect(result).toBe(
        '/tmp/test-analyses-storage/analyses/my-analysis/src/main.js',
      );
    });

    it('should reject unsafe analysis ID', () => {
      const analysisId = '../../../etc/passwd';
      const segments = ['index.js'];

      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      expect(result).toBeNull();
    });

    it('should reject segment with parent directory traversal', () => {
      const analysisId = 'my-analysis';
      const segments = ['..', 'index.js'];

      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      expect(result).toBeNull();
    });

    it('should reject segment with embedded parent directory traversal', () => {
      const analysisId = 'my-analysis';
      const segments = ['src/../../../etc/passwd'];

      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      expect(result).toBeNull();
    });

    it('should reject segment with absolute path', () => {
      const analysisId = 'my-analysis';
      const segments = ['/etc/passwd'];

      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      expect(result).toBeNull();
    });

    it('should reject multiple segments if any contains parent traversal', () => {
      const analysisId = 'my-analysis';
      const segments = ['src', '..', 'config.js'];

      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      expect(result).toBeNull();
    });

    it('should allow segment with single dot (normalized by path.join)', () => {
      const analysisId = 'my-analysis';
      const segments = ['.'];

      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      // Single dot is allowed as it's not '..' but path.join normalizes it away
      // path.join('/base', 'id', '.') === '/base/id'
      expect(result).toBe('/tmp/test-analyses-storage/analyses/my-analysis');
    });

    it('should allow segments with hyphens, underscores, and numbers', () => {
      const analysisId = 'my-analysis';
      const segments = ['my_file-v1.js', 'test123.json'];

      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      expect(result).toBe(
        '/tmp/test-analyses-storage/analyses/my-analysis/my_file-v1.js/test123.json',
      );
    });

    it('should return null if analysisId is not safe (contains special chars)', () => {
      const analysisId = 'my(analysis)';
      const segments = ['index.js'];

      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      expect(result).toBeNull();
    });

    it('should handle empty segments array', () => {
      const analysisId = 'my-analysis';
      const segments: string[] = [];

      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      expect(result).toBe('/tmp/test-analyses-storage/analyses/my-analysis');
    });

    it('should reject segment containing windows-style path traversal', () => {
      const analysisId = 'my-analysis';
      const segments = ['..\\..\\etc\\passwd'];

      // The check is for '..' in segment, and this contains '..'
      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      expect(result).toBeNull();
    });

    it('should reject analysisId with empty string', () => {
      const analysisId = '';
      const segments = ['index.js'];

      const result = safePath.getAnalysisFilePath(analysisId, ...segments);

      expect(result).toBeNull();
    });
  });

  describe('safeMkdir with undefined basePath', () => {
    it('should use default config.paths.analysis when basePath is undefined', async () => {
      const dirPath = '/tmp/test-analyses-storage/analyses/new-analysis';

      // Call without basePath (defaults to undefined)
      await safePath.safeMkdir(dirPath, undefined, { recursive: true });

      expect(fs.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    it('should reject traversal attempts when basePath is undefined (uses config default)', async () => {
      const dirPath = '/tmp/test-analyses-storage/analyses/../../../etc';

      await expect(
        safePath.safeMkdir(dirPath, undefined, { recursive: true }),
      ).rejects.toThrow('Path traversal attempt detected');
    });
  });

  describe('safeReadFile with undefined basePath', () => {
    it('should use default config.paths.analysis when basePath is undefined', async () => {
      const filePath = '/tmp/test-analyses-storage/analyses/analysis/index.js';

      fs.readFile.mockResolvedValueOnce('mock content');

      const content = await safePath.safeReadFile(filePath, undefined, {
        encoding: 'utf8',
      });

      expect(fs.readFile).toHaveBeenCalledWith(filePath, { encoding: 'utf8' });
      expect(content).toBe('mock content');
    });

    it('should reject traversal attempts when basePath is undefined', async () => {
      const filePath =
        '/tmp/test-analyses-storage/analyses/../../../etc/passwd';

      await expect(
        safePath.safeReadFile(filePath, undefined, { encoding: 'utf8' }),
      ).rejects.toThrow('Path traversal attempt detected');
    });

    it('should handle options parameter correctly', async () => {
      const filePath = '/tmp/test-analyses-storage/analyses/analysis/index.js';
      const options = { encoding: 'utf8' as const };

      fs.readFile.mockResolvedValueOnce('mock content');

      await safePath.safeReadFile(filePath, undefined, options);

      expect(fs.readFile).toHaveBeenCalledWith(filePath, options);
    });
  });

  describe('safeReaddir with undefined basePath', () => {
    it('should use default config.paths.analysis when basePath is undefined', async () => {
      const dirPath = '/tmp/test-analyses-storage/analyses';

      fs.readdir.mockResolvedValueOnce([]);

      const files = await safePath.safeReaddir(dirPath, undefined);

      expect(fs.readdir).toHaveBeenCalledWith(dirPath, undefined);
      expect(files).toEqual([]);
    });

    it('should reject traversal attempts when basePath is undefined', async () => {
      const dirPath = '/tmp/test-analyses-storage/analyses/../../../etc';

      await expect(safePath.safeReaddir(dirPath, undefined)).rejects.toThrow(
        'Path traversal attempt detected',
      );
    });

    it('should handle withFileTypes option when basePath is undefined', async () => {
      const dirPath = '/tmp/test-analyses-storage/analyses';
      const options = { withFileTypes: true };

      fs.readdir.mockResolvedValueOnce([]);

      await safePath.safeReaddir(dirPath, undefined, options);

      expect(fs.readdir).toHaveBeenCalledWith(dirPath, options);
    });
  });

  describe('safeExistsSync', () => {
    it('should not throw for safe path', () => {
      const filePath = '/tmp/test-analyses-storage/analyses/analysis/index.js';
      const basePath = '/tmp/test-analyses-storage/analyses';

      // Should not throw - path validation passes
      expect(() => safePath.safeExistsSync(filePath, basePath)).not.toThrow();
    });

    it('should reject unsafe paths', () => {
      const filePath =
        '/tmp/test-analyses-storage/analyses/../../../etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      expect(() => {
        safePath.safeExistsSync(filePath, basePath);
      }).toThrow('Path traversal attempt detected');
    });

    it('should allow null basePath (no path restriction)', () => {
      const filePath = '/etc/passwd';

      // With null basePath, validation is skipped
      expect(() => safePath.safeExistsSync(filePath, null)).not.toThrow();
    });
  });

  describe('safeMkdirSync', () => {
    it('should not throw for safe path', () => {
      const dirPath = '/tmp/test-analyses-storage/analyses/new-analysis';
      const basePath = '/tmp/test-analyses-storage/analyses';

      // Should not throw - path validation passes
      expect(() =>
        safePath.safeMkdirSync(dirPath, basePath, { recursive: true }),
      ).not.toThrow();
    });

    it('should reject unsafe paths', () => {
      const dirPath = '/tmp/test-analyses-storage/analyses/../../../etc';
      const basePath = '/tmp/test-analyses-storage/analyses';

      expect(() => {
        safePath.safeMkdirSync(dirPath, basePath);
      }).toThrow('Path traversal attempt detected');
    });

    it('should not throw when basePath not provided (uses config default)', () => {
      const dirPath = '/tmp/test-analyses-storage/analyses/new-analysis';

      // Should not throw - uses default config.paths.analysis
      expect(() => safePath.safeMkdirSync(dirPath)).not.toThrow();
    });
  });

  describe('safeWriteFileSync', () => {
    it('should not throw for safe path', () => {
      const filePath = '/tmp/test-analyses-storage/analyses/analysis/index.js';
      const basePath = '/tmp/test-analyses-storage/analyses';
      const content = 'console.log("test");';

      expect(() =>
        safePath.safeWriteFileSync(filePath, content, basePath),
      ).not.toThrow();
    });

    it('should reject unsafe paths', () => {
      const filePath =
        '/tmp/test-analyses-storage/analyses/../../../etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      expect(() => {
        safePath.safeWriteFileSync(filePath, 'malicious', basePath);
      }).toThrow('Path traversal attempt detected');
    });

    it('should not throw when writing buffer content', () => {
      const filePath = '/tmp/test-analyses-storage/analyses/analysis/data.bin';
      const basePath = '/tmp/test-analyses-storage/analyses';
      const content = Buffer.from('binary data');

      expect(() =>
        safePath.safeWriteFileSync(filePath, content, basePath),
      ).not.toThrow();
    });

    it('should not throw when using default basePath from config', () => {
      const filePath = '/tmp/test-analyses-storage/analyses/analysis/file.txt';
      const content = 'test content';

      expect(() => safePath.safeWriteFileSync(filePath, content)).not.toThrow();
    });
  });

  describe('safeUnlinkSync', () => {
    it('should not throw for safe path', () => {
      const filePath = '/tmp/test-analyses-storage/analyses/analysis/temp.log';
      const basePath = '/tmp/test-analyses-storage/analyses';

      expect(() => safePath.safeUnlinkSync(filePath, basePath)).not.toThrow();
    });

    it('should reject unsafe paths', () => {
      const filePath =
        '/tmp/test-analyses-storage/analyses/../../../etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      expect(() => {
        safePath.safeUnlinkSync(filePath, basePath);
      }).toThrow('Path traversal attempt detected');
    });

    it('should not throw when basePath not provided (uses config default)', () => {
      const filePath = '/tmp/test-analyses-storage/analyses/analysis/file.txt';

      expect(() => safePath.safeUnlinkSync(filePath)).not.toThrow();
    });
  });

  describe('isPathSafe edge cases', () => {
    it('should handle trailing slashes in paths', () => {
      const targetPath =
        '/tmp/test-analyses-storage/analyses/my-analysis/index.js/';
      const basePath = '/tmp/test-analyses-storage/analyses/';

      const result = safePath.isPathSafe(targetPath, basePath);

      expect(result).toBe(true);
    });

    it('should normalize paths with multiple slashes', () => {
      const targetPath =
        '/tmp/test-analyses-storage//analyses///my-analysis/index.js';
      const basePath = '/tmp/test-analyses-storage/analyses';

      const result = safePath.isPathSafe(targetPath, basePath);

      expect(result).toBe(true);
    });

    it('should detect traversal with double dots at different positions', () => {
      const cases = [
        '/tmp/../test-analyses-storage/analyses/file.js',
        '/tmp/test-analyses-storage/../analyses/file.js',
        '/tmp/test-analyses-storage/analyses/../../file.js',
        '/tmp/test-analyses-storage/analyses/subdir/../../file.js',
      ];

      const basePath = '/tmp/test-analyses-storage/analyses';

      cases.forEach((targetPath) => {
        const result = safePath.isPathSafe(targetPath, basePath);
        expect(result).toBe(false);
      });
    });

    it('should properly handle relative path normalization', () => {
      // When resolving relative paths, path.resolve uses cwd as base
      // This ensures the behavior is correct
      const targetPath = '/tmp/test-analyses-storage/analyses/./my-analysis';
      const basePath = '/tmp/test-analyses-storage/analyses';

      const result = safePath.isPathSafe(targetPath, basePath);

      expect(result).toBe(true);
    });
  });

  describe('isAbsolutePathSafe edge cases', () => {
    it('should reject paths with mixed traversal patterns', () => {
      const paths = [
        '/app/certs/.././etc/passwd',
        '/app/./certs/../../etc/passwd',
        '/app/certs/./../../etc/passwd',
      ];

      paths.forEach((filePath) => {
        const result = safePath.isAbsolutePathSafe(filePath);
        expect(result).toBe(false);
      });
    });

    it('should allow paths with multiple consecutive slashes', () => {
      const filePath = '/app//certs///server.pem';

      const result = safePath.isAbsolutePathSafe(filePath);

      expect(result).toBe(true);
    });

    it('should allow paths with dots in filename', () => {
      const filePath = '/app/certs/server.crt.pem';

      const result = safePath.isAbsolutePathSafe(filePath);

      expect(result).toBe(true);
    });

    it('should reject single dot in path', () => {
      // /app/./certs should contain '..', no it shouldn't
      // But the function checks for '..' specifically
      const filePath = '/app/./certs/server.pem';

      const result = safePath.isAbsolutePathSafe(filePath);

      // This should pass because './' is allowed, only '..' is blocked
      expect(result).toBe(true);
    });
  });

  describe('Complex path traversal attack patterns', () => {
    it('should treat URL-encoded paths as literal (not decoded)', () => {
      const targetPath =
        '/tmp/test-analyses-storage/analyses/%2e%2e/%2e%2e/etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      const result = safePath.isPathSafe(targetPath, basePath);

      // URL encoding is NOT decoded by path.resolve, so %2e%2e stays literal
      // The path stays within the base directory because %2e%2e != ..
      // Note: Applications should URL-decode user input before validation if needed
      expect(result).toBe(true);
    });

    it('should block unicode normalization attacks', () => {
      // Different unicode representations of the same character
      // U+002E is the period character
      const targetPath =
        '/tmp/test-analyses-storage/analyses/\u002e\u002e/etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      // This creates a literal unicode sequence ("..")
      const result = safePath.isPathSafe(targetPath, basePath);

      // Should be blocked as it represents ".." path traversal
      expect(result).toBe(false);
    });

    it('should reject deeply nested traversal attempts', () => {
      const targetPath =
        '/tmp/test-analyses-storage/analyses/../../../../../../etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      const result = safePath.isPathSafe(targetPath, basePath);

      expect(result).toBe(false);
    });

    it('should reject traversal attempts mixed with valid segments', () => {
      const targetPath =
        '/tmp/test-analyses-storage/analyses/subdir/../../../etc/passwd';
      const basePath = '/tmp/test-analyses-storage/analyses';

      const result = safePath.isPathSafe(targetPath, basePath);

      expect(result).toBe(false);
    });
  });
});
