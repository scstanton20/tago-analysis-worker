import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock analysis service
const mockAnalysisService = {
  getConfig: vi.fn(),
};

const mockSseManager = {
  broadcastToTeamUsers: vi.fn(),
};

// Mock the lazy loader
vi.mock('../../src/utils/lazyLoader.ts', () => ({
  getAnalysisService: vi.fn(() => Promise.resolve(mockAnalysisService)),
  getSseManager: vi.fn(() => Promise.resolve(mockSseManager)),
}));

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

import { broadcastTeamStructureUpdate } from '../../src/services/analysis/index.ts';

describe('broadcastTeamStructureUpdate (AnalysisNotificationService)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should broadcast team structure update', async () => {
    const mockConfig: MockConfig = {
      teamStructure: {
        team1: { items: [{ id: '1', name: 'item1' }] },
      },
    };

    mockAnalysisService.getConfig.mockResolvedValue(mockConfig);

    await broadcastTeamStructureUpdate('team1');

    expect(mockAnalysisService.getConfig).toHaveBeenCalled();
    expect(mockSseManager.broadcastToTeamUsers).toHaveBeenCalledWith(
      'team1',
      expect.objectContaining({
        type: 'teamStructureUpdated',
        teamId: 'team1',
      }),
    );
  });

  it('should handle missing team structure gracefully', async () => {
    const mockConfig: MockConfig = {
      teamStructure: {},
    };

    mockAnalysisService.getConfig.mockResolvedValue(mockConfig);

    await broadcastTeamStructureUpdate('nonexistent-team');

    expect(mockSseManager.broadcastToTeamUsers).toHaveBeenCalledWith(
      'nonexistent-team',
      expect.objectContaining({
        items: [],
      }),
    );
  });

  it('should not throw error on broadcast failure (swallows error)', async () => {
    mockAnalysisService.getConfig.mockRejectedValue(new Error('Config error'));

    // The new notification service swallows errors instead of throwing
    await expect(broadcastTeamStructureUpdate('team1')).resolves.not.toThrow();
  });
});
