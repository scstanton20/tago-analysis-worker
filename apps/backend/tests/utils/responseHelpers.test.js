import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../src/utils/logging/logger.js', () => ({
  createChildLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('responseHelpers', () => {
  let responseHelpers;

  beforeEach(async () => {
    vi.clearAllMocks();
    responseHelpers = await import('../../src/utils/responseHelpers.js');
  });

  describe('broadcastTeamStructureUpdate', () => {
    it('should broadcast team structure update', async () => {
      const mockConfig = {
        teamStructure: {
          team1: { items: [{ id: '1', name: 'item1' }] },
        },
      };

      const mockAnalysisService = {
        getConfig: vi.fn().mockResolvedValue(mockConfig),
      };

      const mockSseManager = {
        broadcastToTeamUsers: vi.fn(),
      };

      // Mock the dynamic import
      vi.doMock('../../src/services/analysisService.js', () => ({
        analysisService: mockAnalysisService,
      }));

      await responseHelpers.broadcastTeamStructureUpdate(
        mockSseManager,
        'team1',
      );

      expect(mockAnalysisService.getConfig).toHaveBeenCalled();
      expect(mockSseManager.broadcastToTeamUsers).toHaveBeenCalledWith(
        'team1',
        expect.objectContaining({
          type: 'teamStructureUpdated',
          teamId: 'team1',
        }),
      );

      vi.doUnmock('../../src/services/analysisService.js');
    });

    it('should handle missing team structure gracefully', async () => {
      const mockConfig = {
        teamStructure: {},
      };

      const mockAnalysisService = {
        getConfig: vi.fn().mockResolvedValue(mockConfig),
      };

      const mockSseManager = {
        broadcastToTeamUsers: vi.fn(),
      };

      vi.doMock('../../src/services/analysisService.js', () => ({
        analysisService: mockAnalysisService,
      }));

      await responseHelpers.broadcastTeamStructureUpdate(
        mockSseManager,
        'nonexistent-team',
      );

      expect(mockSseManager.broadcastToTeamUsers).toHaveBeenCalledWith(
        'nonexistent-team',
        expect.objectContaining({
          items: [],
        }),
      );

      vi.doUnmock('../../src/services/analysisService.js');
    });

    it('should throw error on broadcast failure', async () => {
      const mockAnalysisService = {
        getConfig: vi.fn().mockRejectedValue(new Error('Config error')),
      };

      const mockSseManager = {
        broadcastToTeamUsers: vi.fn(),
      };

      vi.doMock('../../src/services/analysisService.js', () => ({
        analysisService: mockAnalysisService,
      }));

      await expect(
        responseHelpers.broadcastTeamStructureUpdate(mockSseManager, 'team1'),
      ).rejects.toThrow('Config error');

      vi.doUnmock('../../src/services/analysisService.js');
    });
  });
});
