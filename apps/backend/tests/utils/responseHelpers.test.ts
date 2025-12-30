import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Mock logger
vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

type TeamStructureItem = {
  id: string;
  name: string;
};

type TeamStructure = {
  [key: string]: {
    items: TeamStructureItem[];
  };
};

type MockConfig = {
  teamStructure: TeamStructure;
};

type MockSSEManager = {
  broadcastToTeamUsers: Mock;
};

type MockAnalysisService = {
  getConfig: Mock;
};

describe('responseHelpers', () => {
  let responseHelpers: typeof import('../../src/utils/responseHelpers.ts');

  beforeEach(async () => {
    vi.clearAllMocks();
    responseHelpers = await import('../../src/utils/responseHelpers.ts');
  });

  describe('broadcastTeamStructureUpdate', () => {
    it('should broadcast team structure update', async () => {
      const mockConfig: MockConfig = {
        teamStructure: {
          team1: { items: [{ id: '1', name: 'item1' }] },
        },
      };

      const mockAnalysisService: MockAnalysisService = {
        getConfig: vi.fn().mockResolvedValue(mockConfig),
      };

      const mockSseManager: MockSSEManager = {
        broadcastToTeamUsers: vi.fn(),
      };

      // Mock the dynamic import
      vi.doMock('../../src/services/analysisService.ts', () => ({
        analysisService: mockAnalysisService,
      }));

      await responseHelpers.broadcastTeamStructureUpdate(
        mockSseManager as unknown as Parameters<
          typeof responseHelpers.broadcastTeamStructureUpdate
        >[0],
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

      vi.doUnmock('../../src/services/analysisService.ts');
    });

    it('should handle missing team structure gracefully', async () => {
      const mockConfig: MockConfig = {
        teamStructure: {},
      };

      const mockAnalysisService: MockAnalysisService = {
        getConfig: vi.fn().mockResolvedValue(mockConfig),
      };

      const mockSseManager: MockSSEManager = {
        broadcastToTeamUsers: vi.fn(),
      };

      vi.doMock('../../src/services/analysisService.ts', () => ({
        analysisService: mockAnalysisService,
      }));

      await responseHelpers.broadcastTeamStructureUpdate(
        mockSseManager as unknown as Parameters<
          typeof responseHelpers.broadcastTeamStructureUpdate
        >[0],
        'nonexistent-team',
      );

      expect(mockSseManager.broadcastToTeamUsers).toHaveBeenCalledWith(
        'nonexistent-team',
        expect.objectContaining({
          items: [],
        }),
      );

      vi.doUnmock('../../src/services/analysisService.ts');
    });

    it('should throw error on broadcast failure', async () => {
      const mockAnalysisService: MockAnalysisService = {
        getConfig: vi.fn().mockRejectedValue(new Error('Config error')),
      };

      const mockSseManager: MockSSEManager = {
        broadcastToTeamUsers: vi.fn(),
      };

      vi.doMock('../../src/services/analysisService.ts', () => ({
        analysisService: mockAnalysisService,
      }));

      await expect(
        responseHelpers.broadcastTeamStructureUpdate(
          mockSseManager as unknown as Parameters<
            typeof responseHelpers.broadcastTeamStructureUpdate
          >[0],
          'team1',
        ),
      ).rejects.toThrow('Config error');

      vi.doUnmock('../../src/services/analysisService.ts');
    });
  });
});
