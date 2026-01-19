/**
 * Analysis Environment Service Tests
 *
 * Tests for managing environment variables for analyses including
 * reading, encrypting, updating, and restart behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create hoisted mocks
const { mockEncrypt, mockDecrypt, mockSafeReadFile, mockSafeWriteFile } =
  vi.hoisted(() => ({
    mockEncrypt: vi.fn((value: string) => `encrypted_${value}`),
    mockDecrypt: vi.fn((value: string) => value.replace('encrypted_', '')),
    mockSafeReadFile: vi.fn(),
    mockSafeWriteFile: vi.fn(),
  }));

// Mock dependencies
vi.mock('../../src/utils/cryptoUtils.ts', () => ({
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
}));

vi.mock('../../src/utils/safePath.ts', () => ({
  safeReadFile: mockSafeReadFile,
  safeWriteFile: mockSafeWriteFile,
}));

vi.mock('../../src/config/default.ts', () => ({
  config: {
    paths: {
      analysis: '/test/analyses',
    },
  },
}));

// Import after mocks
import { AnalysisEnvironmentService } from '../../src/services/analysis/AnalysisEnvironmentService.ts';
import type {
  IAnalysisConfigService,
  IAnalysisLogService,
  IAnalysisLifecycleService,
} from '../../src/services/analysis/types.ts';

describe('AnalysisEnvironmentService', () => {
  let service: AnalysisEnvironmentService;
  let mockConfigService: IAnalysisConfigService;
  let mockLogService: IAnalysisLogService;
  let mockLifecycleService: IAnalysisLifecycleService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfigService = {
      getAnalysisProcess: vi.fn(),
      getAllAnalyses: vi.fn(),
      setAnalysisProcess: vi.fn(),
      deleteAnalysis: vi.fn(),
    } as unknown as IAnalysisConfigService;

    mockLogService = {
      addLog: vi.fn(),
      getInitialLogs: vi.fn(),
      clearLogs: vi.fn(),
    } as unknown as IAnalysisLogService;

    mockLifecycleService = {
      stopAnalysis: vi.fn(),
      runAnalysis: vi.fn(),
    } as unknown as IAnalysisLifecycleService;

    service = new AnalysisEnvironmentService({
      configService: mockConfigService,
      logService: mockLogService,
      lifecycleService: mockLifecycleService,
    });
  });

  describe('getEnvironment', () => {
    it('should return decrypted environment variables', async () => {
      mockSafeReadFile.mockResolvedValue(
        'KEY1=encrypted_value1\nKEY2=encrypted_value2',
      );

      const result = await service.getEnvironment('analysis-1');

      expect(result).toEqual({
        KEY1: 'value1',
        KEY2: 'value2',
      });
      expect(mockDecrypt).toHaveBeenCalledWith('encrypted_value1');
      expect(mockDecrypt).toHaveBeenCalledWith('encrypted_value2');
    });

    it('should return empty object for empty env file', async () => {
      mockSafeReadFile.mockResolvedValue('');

      const result = await service.getEnvironment('analysis-1');

      expect(result).toEqual({});
    });

    it('should return empty object when file does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockSafeReadFile.mockRejectedValue(error);

      const result = await service.getEnvironment('analysis-1');

      expect(result).toEqual({});
    });

    it('should throw error for non-ENOENT errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      mockSafeReadFile.mockRejectedValue(error);

      await expect(service.getEnvironment('analysis-1')).rejects.toThrow(
        'Permission denied',
      );
    });

    it('should skip lines without key or value', async () => {
      mockSafeReadFile.mockResolvedValue(
        'KEY1=encrypted_value1\n\nKEY2=\n=encrypted_value3\nKEY4=encrypted_value4',
      );

      const result = await service.getEnvironment('analysis-1');

      expect(result).toEqual({
        KEY1: 'value1',
        KEY4: 'value4',
      });
    });

    it('should handle single environment variable', async () => {
      mockSafeReadFile.mockResolvedValue('SINGLE_KEY=encrypted_single_value');

      const result = await service.getEnvironment('analysis-1');

      expect(result).toEqual({
        SINGLE_KEY: 'single_value',
      });
    });
  });

  describe('updateEnvironment', () => {
    it('should update environment when analysis is not running', async () => {
      vi.mocked(mockConfigService.getAnalysisProcess).mockReturnValue(
        undefined,
      );

      const result = await service.updateEnvironment('analysis-1', {
        KEY1: 'value1',
        KEY2: 'value2',
      });

      expect(result).toEqual({
        success: true,
        restarted: false,
      });
      expect(mockSafeWriteFile).toHaveBeenCalledWith(
        '/test/analyses/analysis-1/env/.env',
        'KEY1=encrypted_value1\nKEY2=encrypted_value2',
        '/test/analyses',
      );
      expect(mockLifecycleService.stopAnalysis).not.toHaveBeenCalled();
      expect(mockLifecycleService.runAnalysis).not.toHaveBeenCalled();
    });

    it('should stop and restart analysis when it was running', async () => {
      vi.mocked(mockConfigService.getAnalysisProcess).mockReturnValue({
        id: 'analysis-1',
        status: 'running',
        name: 'Test Analysis',
      } as unknown as ReturnType<IAnalysisConfigService['getAnalysisProcess']>);
      vi.mocked(mockLifecycleService.stopAnalysis).mockResolvedValue({
        success: true,
      });
      vi.mocked(mockLifecycleService.runAnalysis).mockResolvedValue({
        success: true,
        status: 'running',
        logs: [],
      });

      const result = await service.updateEnvironment('analysis-1', {
        KEY1: 'value1',
      });

      expect(result).toEqual({
        success: true,
        restarted: true,
      });
      expect(mockLifecycleService.stopAnalysis).toHaveBeenCalledWith(
        'analysis-1',
      );
      expect(mockLogService.addLog).toHaveBeenCalledWith(
        'analysis-1',
        'Analysis stopped to update environment',
      );
      expect(mockSafeWriteFile).toHaveBeenCalled();
      expect(mockLifecycleService.runAnalysis).toHaveBeenCalledWith(
        'analysis-1',
      );
      expect(mockLogService.addLog).toHaveBeenCalledWith(
        'analysis-1',
        'Analysis updated successfully',
      );
    });

    it('should not restart when analysis is stopped', async () => {
      vi.mocked(mockConfigService.getAnalysisProcess).mockReturnValue({
        id: 'analysis-1',
        status: 'stopped',
        name: 'Test Analysis',
      } as unknown as ReturnType<IAnalysisConfigService['getAnalysisProcess']>);

      const result = await service.updateEnvironment('analysis-1', {
        KEY1: 'value1',
      });

      expect(result).toEqual({
        success: true,
        restarted: false,
      });
      expect(mockLifecycleService.stopAnalysis).not.toHaveBeenCalled();
      expect(mockLifecycleService.runAnalysis).not.toHaveBeenCalled();
    });

    it('should throw error when write fails', async () => {
      vi.mocked(mockConfigService.getAnalysisProcess).mockReturnValue(
        undefined,
      );
      mockSafeWriteFile.mockRejectedValue(new Error('Write failed'));

      await expect(
        service.updateEnvironment('analysis-1', { KEY1: 'value1' }),
      ).rejects.toThrow('Failed to update environment: Write failed');
    });

    it('should handle empty environment variables', async () => {
      vi.mocked(mockConfigService.getAnalysisProcess).mockReturnValue(
        undefined,
      );

      const result = await service.updateEnvironment('analysis-1', {});

      expect(result).toEqual({
        success: true,
        restarted: false,
      });
      expect(mockSafeWriteFile).toHaveBeenCalledWith(
        '/test/analyses/analysis-1/env/.env',
        '',
        '/test/analyses',
      );
    });

    it('should throw error when stop fails during running analysis update', async () => {
      vi.mocked(mockConfigService.getAnalysisProcess).mockReturnValue({
        id: 'analysis-1',
        status: 'running',
        name: 'Test Analysis',
      } as unknown as ReturnType<IAnalysisConfigService['getAnalysisProcess']>);
      vi.mocked(mockLifecycleService.stopAnalysis).mockRejectedValue(
        new Error('Stop failed'),
      );

      await expect(
        service.updateEnvironment('analysis-1', { KEY1: 'value1' }),
      ).rejects.toThrow('Failed to update environment: Stop failed');
    });

    it('should throw error when restart fails after update', async () => {
      vi.mocked(mockConfigService.getAnalysisProcess).mockReturnValue({
        id: 'analysis-1',
        status: 'running',
        name: 'Test Analysis',
      } as unknown as ReturnType<IAnalysisConfigService['getAnalysisProcess']>);
      vi.mocked(mockLifecycleService.stopAnalysis).mockResolvedValue({
        success: true,
      });
      vi.mocked(mockLifecycleService.runAnalysis).mockRejectedValue(
        new Error('Start failed'),
      );

      await expect(
        service.updateEnvironment('analysis-1', { KEY1: 'value1' }),
      ).rejects.toThrow('Failed to update environment: Start failed');
    });

    it('should encrypt values before writing', async () => {
      vi.mocked(mockConfigService.getAnalysisProcess).mockReturnValue(
        undefined,
      );

      await service.updateEnvironment('analysis-1', {
        SECRET: 'my-secret-value',
      });

      expect(mockEncrypt).toHaveBeenCalledWith('my-secret-value');
      expect(mockSafeWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        'SECRET=encrypted_my-secret-value',
        expect.any(String),
      );
    });

    it('should handle analysis with error status', async () => {
      vi.mocked(mockConfigService.getAnalysisProcess).mockReturnValue({
        id: 'analysis-1',
        status: 'error',
        name: 'Test Analysis',
      } as unknown as ReturnType<IAnalysisConfigService['getAnalysisProcess']>);

      const result = await service.updateEnvironment('analysis-1', {
        KEY1: 'value1',
      });

      expect(result).toEqual({
        success: true,
        restarted: false,
      });
      expect(mockLifecycleService.stopAnalysis).not.toHaveBeenCalled();
      expect(mockLifecycleService.runAnalysis).not.toHaveBeenCalled();
    });
  });
});
