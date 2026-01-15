/**
 * Analysis Info Service Unit Tests
 *
 * Tests for the analysisInfoService which aggregates analysis metadata
 * and manages analysis notes (information.md files).
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';

type MockAnalysis = {
  analysisId: string;
  analysisName: string;
  teamId?: string | null;
  status?: string;
  enabled?: boolean;
  intendedState?: string;
  lastStartTime?: string | null;
  restartAttempts?: number;
  isConnected?: boolean;
  reconnectionAttempts?: number;
  totalLogCount?: number;
};

type MockTeam = {
  id: string;
  name: string;
};

type SafePathMock = {
  safeReadFile: Mock;
  safeWriteFile: Mock;
  safeStat: Mock;
};

type AnalysisServiceMock = {
  getAnalysisProcess: Mock;
};

type TeamServiceMock = {
  getTeam: Mock;
};

type AnalysisInfoServiceType = {
  getNotesPath: (analysisId: string) => string;
  countLines: (content: string | null) => number;
  getDefaultTemplate: () => string;
  getAnalysisMeta: (analysisId: string) => Promise<{
    analysisId: string;
    analysisName: string;
    file: {
      size: number;
      sizeFormatted: string;
      lineCount: number;
      created: string;
      modified: string;
    };
    environment: unknown;
    logs: unknown;
    versions: unknown;
    team: { id: string | null; name: string };
    process: { status: string; enabled: boolean; intendedState: string };
    dns: {
      enabled: boolean;
      cacheSize: number;
      hits: number;
      misses: number;
      hitRate: number;
    };
    notes: unknown;
  }>;
  getAnalysisNotes: (analysisId: string) => Promise<{
    content: string;
    isNew: boolean;
    analysisId: string;
    analysisName: string;
    lineCount: number;
    size: number;
    sizeFormatted: string;
    lastModified?: Date;
  }>;
  updateAnalysisNotes: (
    analysisId: string,
    content: string,
  ) => Promise<{
    success: boolean;
    analysisId: string;
    analysisName: string;
    lineCount: number;
    lastModified: Date;
  }>;
  notesExist: (analysisId: string) => Promise<boolean>;
};

// Mock dependencies
vi.mock('../../src/services/analysis/index.ts', () => ({
  analysisService: {
    getAnalysisProcess: vi.fn(),
  },
}));

vi.mock('../../src/services/teamService.ts', () => ({
  teamService: {
    getTeam: vi.fn(),
  },
}));

vi.mock('../../src/services/dnsCache.ts', () => ({
  dnsCache: {
    getStats: vi.fn().mockReturnValue({
      cacheSize: 100,
      hits: 50,
      misses: 10,
      hitRate: 0.833,
    }),
    getConfig: vi.fn().mockReturnValue({ enabled: true }),
  },
}));

vi.mock('../../src/services/metricsService.ts', () => ({
  metricsService: {
    getProcessMetrics: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../src/utils/safePath.ts', () => ({
  safeReadFile: vi.fn(),
  safeWriteFile: vi.fn(),
  safeStat: vi.fn(),
}));

vi.mock('../../src/config/default.ts', () => ({
  config: {
    paths: {
      analysis: '/tmp/test-analyses',
    },
  },
}));

describe('analysisInfoService', () => {
  let analysisInfoService: AnalysisInfoServiceType;
  let analysisService: AnalysisServiceMock;
  let teamService: TeamServiceMock;
  let safePath: SafePathMock;
  let formatFileSize: (bytes: number) => string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import mocked modules
    const analysisServiceModule =
      await import('../../src/services/analysis/index.ts');
    analysisService =
      analysisServiceModule.analysisService as unknown as AnalysisServiceMock;

    const teamServiceModule = await import('../../src/services/teamService.ts');
    teamService = teamServiceModule.teamService as unknown as TeamServiceMock;

    safePath =
      (await import('../../src/utils/safePath.ts')) as unknown as SafePathMock;

    // Import formatters
    const formattersModule = await import('../../src/utils/formatters.ts');
    formatFileSize = formattersModule.formatFileSize;

    // Import the service under test
    const module = await import('../../src/services/analysisInfoService.ts');
    analysisInfoService =
      module.analysisInfoService as unknown as AnalysisInfoServiceType;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getNotesPath', () => {
    it('should return correct path for notes file', () => {
      const analysisId = '123e4567-e89b-12d3-a456-426614174000';
      const path = analysisInfoService.getNotesPath(analysisId);

      expect(path).toBe(`/tmp/test-analyses/${analysisId}/information.md`);
    });
  });

  describe('countLines', () => {
    it('should return 0 for null content', () => {
      expect(analysisInfoService.countLines(null)).toBe(0);
    });

    it('should return 0 for empty string', () => {
      expect(analysisInfoService.countLines('')).toBe(0);
    });

    it('should count lines correctly', () => {
      expect(analysisInfoService.countLines('line1\nline2\nline3')).toBe(3);
    });

    it('should count single line correctly', () => {
      expect(analysisInfoService.countLines('single line')).toBe(1);
    });
  });

  describe('formatFileSize', () => {
    it('should return "0 B" for zero bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('should format bytes correctly', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatFileSize(1048576)).toBe('1 MB');
    });

    it('should format with decimals', () => {
      expect(formatFileSize(1500)).toBe('1.46 KB');
    });
  });

  describe('getDefaultTemplate', () => {
    it('should return a string template with required sections', () => {
      const template = analysisInfoService.getDefaultTemplate();

      expect(typeof template).toBe('string');
      expect(template).toContain('# Analysis Notes');
      expect(template).toContain('## Description');
      expect(template).toContain('## Triggers & Tago Information');
      expect(template).toContain('## Dependencies');
      expect(template).toContain('## Additional Notes');
    });
  });

  describe('getAnalysisMeta', () => {
    const mockAnalysisId = '123e4567-e89b-12d3-a456-426614174000';
    const mockAnalysis: MockAnalysis = {
      analysisId: mockAnalysisId,
      analysisName: 'Test Analysis',
      teamId: 'team-123',
      status: 'running',
      enabled: true,
      intendedState: 'running',
      lastStartTime: '2024-01-01T00:00:00Z',
      restartAttempts: 0,
      isConnected: true,
      reconnectionAttempts: 0,
      totalLogCount: 100,
    };

    beforeEach(() => {
      analysisService.getAnalysisProcess.mockReturnValue(mockAnalysis);
      teamService.getTeam.mockResolvedValue({
        id: 'team-123',
        name: 'Test Team',
      } as MockTeam);

      // Mock file stats
      safePath.safeStat.mockResolvedValue({
        size: 1024,
        birthtime: new Date('2024-01-01'),
        mtime: new Date('2024-01-15'),
      });

      // Mock file content
      safePath.safeReadFile.mockResolvedValue(
        'console.log("test");\nconsole.log("test2");',
      );
    });

    it('should throw error if analysis not found', async () => {
      analysisService.getAnalysisProcess.mockReturnValue(null);

      await expect(
        analysisInfoService.getAnalysisMeta(mockAnalysisId),
      ).rejects.toThrow(`Analysis ${mockAnalysisId} not found`);
    });

    it('should return complete metadata object', async () => {
      const meta = await analysisInfoService.getAnalysisMeta(mockAnalysisId);

      expect(meta).toHaveProperty('analysisId', mockAnalysisId);
      expect(meta).toHaveProperty('analysisName', 'Test Analysis');
      expect(meta).toHaveProperty('file');
      expect(meta).toHaveProperty('environment');
      expect(meta).toHaveProperty('logs');
      expect(meta).toHaveProperty('versions');
      expect(meta).toHaveProperty('team');
      expect(meta).toHaveProperty('process');
      expect(meta).toHaveProperty('dns');
      expect(meta).toHaveProperty('notes');
    });

    it('should include file statistics', async () => {
      const meta = await analysisInfoService.getAnalysisMeta(mockAnalysisId);

      expect(meta.file).toHaveProperty('size');
      expect(meta.file).toHaveProperty('sizeFormatted');
      expect(meta.file).toHaveProperty('lineCount');
      expect(meta.file).toHaveProperty('created');
      expect(meta.file).toHaveProperty('modified');
    });

    it('should include process status', async () => {
      const meta = await analysisInfoService.getAnalysisMeta(mockAnalysisId);

      expect(meta.process).toHaveProperty('status', 'running');
      expect(meta.process).toHaveProperty('enabled', true);
      expect(meta.process).toHaveProperty('intendedState', 'running');
    });

    it('should include team information', async () => {
      const meta = await analysisInfoService.getAnalysisMeta(mockAnalysisId);

      expect(meta.team).toHaveProperty('id', 'team-123');
      expect(meta.team).toHaveProperty('name', 'Test Team');
    });

    it('should handle missing team gracefully', async () => {
      const analysisWithoutTeam = { ...mockAnalysis, teamId: null };
      analysisService.getAnalysisProcess.mockReturnValue(analysisWithoutTeam);

      const meta = await analysisInfoService.getAnalysisMeta(mockAnalysisId);

      expect(meta.team).toHaveProperty('id', null);
      expect(meta.team).toHaveProperty('name', 'Uncategorized');
    });

    it('should include DNS cache information', async () => {
      const meta = await analysisInfoService.getAnalysisMeta(mockAnalysisId);

      // DNS info is included regardless of enabled state
      expect(meta.dns).toHaveProperty('enabled');
      expect(meta.dns).toHaveProperty('cacheSize');
      expect(meta.dns).toHaveProperty('hits');
      expect(meta.dns).toHaveProperty('misses');
      expect(meta.dns).toHaveProperty('hitRate');
    });
  });

  describe('getAnalysisNotes', () => {
    const mockAnalysisId = '123e4567-e89b-12d3-a456-426614174000';
    const mockAnalysis: MockAnalysis = {
      analysisId: mockAnalysisId,
      analysisName: 'Test Analysis',
    };

    beforeEach(() => {
      analysisService.getAnalysisProcess.mockReturnValue(mockAnalysis);
    });

    it('should throw error if analysis not found', async () => {
      analysisService.getAnalysisProcess.mockReturnValue(null);

      await expect(
        analysisInfoService.getAnalysisNotes(mockAnalysisId),
      ).rejects.toThrow(`Analysis ${mockAnalysisId} not found`);
    });

    it('should return existing notes content', async () => {
      const existingContent = '# My Notes\n\nSome content here.';
      safePath.safeReadFile.mockResolvedValue(existingContent);
      safePath.safeStat.mockResolvedValue({
        size: existingContent.length,
        mtime: new Date('2024-01-15'),
      });

      const result = await analysisInfoService.getAnalysisNotes(mockAnalysisId);

      expect(result).toHaveProperty('content', existingContent);
      expect(result).toHaveProperty('isNew', false);
      expect(result).toHaveProperty('analysisId', mockAnalysisId);
      expect(result).toHaveProperty('analysisName', 'Test Analysis');
    });

    it('should create default notes if file does not exist', async () => {
      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      safePath.safeReadFile.mockRejectedValueOnce(enoentError);
      safePath.safeWriteFile.mockResolvedValue(undefined);
      safePath.safeStat.mockResolvedValue({ size: 100, mtime: new Date() });

      const result = await analysisInfoService.getAnalysisNotes(mockAnalysisId);

      expect(result).toHaveProperty('isNew', true);
      expect(result.content).toContain('# Analysis Notes');
      expect(safePath.safeWriteFile).toHaveBeenCalled();
    });

    it('should include line count and size', async () => {
      const content = 'line1\nline2\nline3';
      safePath.safeReadFile.mockResolvedValue(content);
      safePath.safeStat.mockResolvedValue({
        size: content.length,
        mtime: new Date(),
      });

      const result = await analysisInfoService.getAnalysisNotes(mockAnalysisId);

      expect(result).toHaveProperty('lineCount', 3);
      expect(result).toHaveProperty('size', content.length);
      expect(result).toHaveProperty('sizeFormatted');
    });
  });

  describe('updateAnalysisNotes', () => {
    const mockAnalysisId = '123e4567-e89b-12d3-a456-426614174000';
    const mockAnalysis: MockAnalysis = {
      analysisId: mockAnalysisId,
      analysisName: 'Test Analysis',
    };

    beforeEach(() => {
      analysisService.getAnalysisProcess.mockReturnValue(mockAnalysis);
      safePath.safeWriteFile.mockResolvedValue(undefined);
      safePath.safeStat.mockResolvedValue({ size: 100, mtime: new Date() });
    });

    it('should throw error if analysis not found', async () => {
      analysisService.getAnalysisProcess.mockReturnValue(null);

      await expect(
        analysisInfoService.updateAnalysisNotes(mockAnalysisId, 'content'),
      ).rejects.toThrow(`Analysis ${mockAnalysisId} not found`);
    });

    it('should write notes to file', async () => {
      const newContent = '# Updated Notes\n\nNew content.';

      const result = await analysisInfoService.updateAnalysisNotes(
        mockAnalysisId,
        newContent,
      );

      expect(safePath.safeWriteFile).toHaveBeenCalled();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('analysisId', mockAnalysisId);
    });

    it('should return updated metadata', async () => {
      const newContent = 'line1\nline2';

      const result = await analysisInfoService.updateAnalysisNotes(
        mockAnalysisId,
        newContent,
      );

      expect(result).toHaveProperty('lineCount', 2);
      expect(result).toHaveProperty('analysisName', 'Test Analysis');
      expect(result).toHaveProperty('lastModified');
    });
  });

  describe('notesExist', () => {
    const mockAnalysisId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return true if notes file exists', async () => {
      safePath.safeStat.mockResolvedValue({ size: 100, mtime: new Date() });

      const result = await analysisInfoService.notesExist(mockAnalysisId);

      expect(result).toBe(true);
    });

    it('should return false if notes file does not exist', async () => {
      safePath.safeStat.mockRejectedValue(new Error('ENOENT'));

      const result = await analysisInfoService.notesExist(mockAnalysisId);

      expect(result).toBe(false);
    });
  });
});
