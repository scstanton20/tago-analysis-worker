import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../src/utils/authDatabase.js', () => ({
  executeQuery: vi.fn(),
  executeQueryAll: vi.fn(),
  executeTransaction: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => ({
  auth: {
    api: {
      createTeam: vi.fn(),
      removeTeam: vi.fn(),
    },
  },
}));

vi.mock('../../src/utils/logging/logger.js', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

const { executeQuery, executeQueryAll, executeTransaction } = await import(
  '../../src/utils/authDatabase.js'
);
const { auth } = await import('../../src/lib/auth.js');

describe('TeamService', () => {
  let teamService;
  let mockAnalysisService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock analysis service
    mockAnalysisService = {
      getConfig: vi.fn().mockResolvedValue({
        version: '4.1',
        analyses: {},
        teamStructure: {},
      }),
      updateConfig: vi.fn().mockResolvedValue(undefined),
    };

    // Re-import to get fresh instance
    const { teamService: service } = await import(
      '../../src/services/teamService.js'
    );
    teamService = service;

    // Reset service state
    teamService.initialized = false;
    teamService.analysisService = null;
    teamService.organizationId = null;

    // Mock organization lookup
    executeQuery.mockReturnValue({ id: 'org-123' });
  });

  describe('initialize', () => {
    it('should initialize with analysis service', async () => {
      await teamService.initialize(mockAnalysisService);

      expect(teamService.initialized).toBe(true);
      expect(teamService.analysisService).toBe(mockAnalysisService);
      expect(teamService.organizationId).toBe('org-123');
      expect(executeQuery).toHaveBeenCalledWith(
        'SELECT id FROM organization WHERE slug = ?',
        ['main'],
        'loading organization ID',
      );
    });

    it('should skip initialization if already initialized', async () => {
      await teamService.initialize(mockAnalysisService);
      executeQuery.mockClear();

      await teamService.initialize(mockAnalysisService);

      expect(executeQuery).not.toHaveBeenCalled();
    });

    it('should throw error if organization not found', async () => {
      executeQuery.mockReturnValue(null);

      await expect(teamService.initialize(mockAnalysisService)).rejects.toThrow(
        'Main organization not found',
      );
    });
  });

  describe('getAllTeams', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should get all teams sorted by order', async () => {
      executeQueryAll.mockReturnValue([
        {
          id: 'team-1',
          name: 'Uncategorized',
          organizationId: 'org-123',
          createdAt: '2025-01-01',
          color: '#3B82F6',
          orderIndex: 0,
          isSystem: 1,
        },
        {
          id: 'team-2',
          name: 'Team Alpha',
          organizationId: 'org-123',
          createdAt: '2025-01-02',
          color: '#10B981',
          orderIndex: 1,
          isSystem: 0,
        },
      ]);

      const teams = await teamService.getAllTeams();

      expect(teams).toHaveLength(2);
      expect(teams[0].isSystem).toBe(true);
      expect(teams[0].orderIndex).toBe(0);
      expect(teams[1].isSystem).toBe(false);
      expect(teams[1].orderIndex).toBe(1);
      expect(executeQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('order_index AS orderIndex'),
        ['org-123'],
        'getting all teams',
      );
    });

    it('should return empty array if no teams', async () => {
      executeQueryAll.mockReturnValue([]);

      const teams = await teamService.getAllTeams();

      expect(teams).toEqual([]);
    });
  });

  describe('getTeam', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should get specific team by ID', async () => {
      executeQuery.mockReturnValue({
        id: 'team-1',
        name: 'Team Alpha',
        organizationId: 'org-123',
        createdAt: '2025-01-01',
        color: '#10B981',
        orderIndex: 1,
        isSystem: 0,
      });

      const team = await teamService.getTeam('team-1');

      expect(team.id).toBe('team-1');
      expect(team.name).toBe('Team Alpha');
      expect(team.isSystem).toBe(false);
      expect(team.orderIndex).toBe(1);
    });

    it('should return undefined if team not found', async () => {
      executeQuery.mockReturnValue(null);

      const team = await teamService.getTeam('nonexistent');

      expect(team).toBeUndefined();
    });
  });

  describe('createTeam', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should create new team via better-auth API', async () => {
      executeQuery.mockReturnValue(null); // No existing team with same name

      auth.api.createTeam.mockResolvedValue({
        id: 'team-new',
        name: 'New Team',
        organizationId: 'org-123',
        createdAt: '2025-01-01',
        color: '#3B82F6',
        order_index: 0,
        is_system: false,
      });

      const team = await teamService.createTeam({ name: 'New Team' });

      expect(team.id).toBe('team-new');
      expect(team.name).toBe('New Team');
      expect(team.orderIndex).toBe(0);
      expect(team.isSystem).toBe(false);
      expect(auth.api.createTeam).toHaveBeenCalledWith({
        body: {
          name: 'New Team',
          organizationId: 'org-123',
          color: '#3B82F6',
          order_index: 0,
          is_system: false,
        },
        headers: {},
      });
    });

    it('should throw error if team name already exists', async () => {
      executeQuery.mockReturnValue({ id: 'existing-team' });

      await expect(
        teamService.createTeam({ name: 'Existing Team' }),
      ).rejects.toThrow('Team with name "Existing Team" already exists');
    });

    it('should handle custom color and order', async () => {
      executeQuery.mockReturnValue(null);

      auth.api.createTeam.mockResolvedValue({
        id: 'team-new',
        name: 'Custom Team',
        organizationId: 'org-123',
        createdAt: '2025-01-01',
        color: '#EF4444',
        order_index: 5,
        is_system: false,
      });

      const team = await teamService.createTeam({
        name: 'Custom Team',
        color: '#EF4444',
        order: 5,
      });

      expect(team.orderIndex).toBe(5);
      expect(auth.api.createTeam).toHaveBeenCalledWith({
        body: expect.objectContaining({
          color: '#EF4444',
          order_index: 5,
        }),
        headers: {},
      });
    });

    it('should handle better-auth API error', async () => {
      executeQuery.mockReturnValue(null);

      auth.api.createTeam.mockResolvedValue({
        error: { message: 'Creation failed' },
      });

      await expect(
        teamService.createTeam({ name: 'Failed Team' }),
      ).rejects.toThrow('Failed to create team');
    });
  });

  describe('updateTeam', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should update team properties', async () => {
      const mockDb = {
        prepare: vi.fn((sql) => ({
          get: vi.fn(() => {
            if (sql.includes('SELECT')) {
              return {
                id: 'team-1',
                name: 'Updated Team',
                organizationId: 'org-123',
                color: '#10B981',
                orderIndex: 2,
                isSystem: 0,
              };
            }
          }),
          run: vi.fn(),
        })),
      };

      executeTransaction.mockImplementation((callback) => callback(mockDb));

      const team = await teamService.updateTeam('team-1', {
        name: 'Updated Team',
        color: '#10B981',
      });

      expect(team.name).toBe('Updated Team');
      expect(team.color).toBe('#10B981');
      expect(team.isSystem).toBe(false);
    });

    it('should throw error if team not found', async () => {
      const mockDb = {
        prepare: vi.fn(() => ({
          get: vi.fn(() => null),
        })),
      };

      executeTransaction.mockImplementation((callback) => callback(mockDb));

      await expect(
        teamService.updateTeam('nonexistent', { name: 'Test' }),
      ).rejects.toThrow('Team nonexistent not found');
    });

    it('should throw error if no valid fields to update', async () => {
      const mockDb = {
        prepare: vi.fn(() => ({
          get: vi.fn(() => ({
            id: 'team-1',
            name: 'Team 1',
            organizationId: 'org-123',
          })),
        })),
      };

      executeTransaction.mockImplementation((callback) => callback(mockDb));

      await expect(
        teamService.updateTeam('team-1', { invalid: 'field' }),
      ).rejects.toThrow('No valid fields to update');
    });

    it('should update orderIndex', async () => {
      let selectCount = 0;
      const mockDb = {
        prepare: vi.fn((sql) => {
          if (sql.includes('SELECT')) {
            selectCount++;
            return {
              get: vi.fn(() => {
                // First SELECT (checking if team exists)
                if (selectCount === 1) {
                  return {
                    id: 'team-1',
                    name: 'Team 1',
                    organizationId: 'org-123',
                    color: '#3B82F6',
                    orderIndex: 0,
                    isSystem: 0,
                  };
                }
                // Second SELECT (returning updated team)
                return {
                  id: 'team-1',
                  name: 'Team 1',
                  organizationId: 'org-123',
                  color: '#3B82F6',
                  orderIndex: 5,
                  isSystem: 0,
                };
              }),
            };
          }
          // UPDATE statement
          return {
            run: vi.fn(),
          };
        }),
      };

      executeTransaction.mockImplementation((callback) => callback(mockDb));

      const team = await teamService.updateTeam('team-1', { order: 5 });

      expect(team.orderIndex).toBe(5);
    });
  });

  describe('deleteTeam', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should delete team via better-auth API', async () => {
      executeQuery.mockReturnValue({
        id: 'team-1',
        name: 'Team to Delete',
        organizationId: 'org-123',
      });

      auth.api.removeTeam.mockResolvedValue(null); // Success

      const result = await teamService.deleteTeam('team-1');

      expect(result.deleted).toBe('team-1');
      expect(result.name).toBe('Team to Delete');
      expect(auth.api.removeTeam).toHaveBeenCalledWith({
        body: { teamId: 'team-1', organizationId: 'org-123' },
        headers: {},
      });
    });

    it('should throw error if team not found', async () => {
      executeQuery.mockReturnValue(null);

      await expect(teamService.deleteTeam('nonexistent')).rejects.toThrow(
        'Team nonexistent not found',
      );
    });

    it('should throw error on better-auth API failure', async () => {
      executeQuery.mockReturnValue({
        id: 'team-1',
        name: 'Team 1',
        organizationId: 'org-123',
      });

      auth.api.removeTeam.mockResolvedValue({
        error: { message: 'Deletion failed' },
      });

      await expect(teamService.deleteTeam('team-1')).rejects.toThrow(
        'Failed to delete team via better-auth',
      );
    });
  });

  describe('getAnalysesByTeam', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should get all analyses for a team', async () => {
      executeQuery.mockReturnValue({ id: 'team-1', name: 'Team 1' });

      mockAnalysisService.getConfig.mockResolvedValue({
        analyses: {
          'analysis-1': { teamId: 'team-1', enabled: true },
          'analysis-2': { teamId: 'team-1', enabled: false },
          'analysis-3': { teamId: 'team-2', enabled: true },
        },
      });

      const analyses = await teamService.getAnalysesByTeam('team-1');

      expect(analyses).toHaveLength(2);
      expect(analyses[0].name).toBe('analysis-1');
      expect(analyses[1].name).toBe('analysis-2');
    });

    it('should throw error if team not found', async () => {
      executeQuery.mockReturnValue(null);

      await expect(
        teamService.getAnalysesByTeam('nonexistent'),
      ).rejects.toThrow('Team nonexistent not found');
    });

    it('should return empty array if no analyses', async () => {
      executeQuery.mockReturnValue({ id: 'team-1', name: 'Team 1' });

      mockAnalysisService.getConfig.mockResolvedValue({
        analyses: {},
      });

      const analyses = await teamService.getAnalysesByTeam('team-1');

      expect(analyses).toEqual([]);
    });
  });

  describe('moveAnalysisToTeam', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should move analysis to different team', async () => {
      const analysisId = 'test-analysis-uuid-123';

      executeQuery.mockReturnValue({ id: 'team-2', name: 'Team 2' });

      mockAnalysisService.getConfig.mockResolvedValue({
        version: '5.0',
        analyses: {
          [analysisId]: {
            id: analysisId,
            name: 'test-analysis',
            teamId: 'team-1',
            enabled: true,
          },
        },
        teamStructure: {
          'team-1': {
            items: [{ id: analysisId, type: 'analysis' }],
          },
          'team-2': { items: [] },
        },
      });

      const result = await teamService.moveAnalysisToTeam(analysisId, 'team-2');

      expect(result.analysisId).toBe(analysisId);
      expect(result.analysisName).toBe('test-analysis');
      expect(result.from).toBe('team-1');
      expect(result.to).toBe('team-2');
      expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
    });

    it('should throw error if analysis not found', async () => {
      mockAnalysisService.getConfig.mockResolvedValue({ analyses: {} });

      await expect(
        teamService.moveAnalysisToTeam('nonexistent-uuid', 'team-1'),
      ).rejects.toThrow('Analysis nonexistent-uuid not found');
    });

    it('should throw error if target team not found', async () => {
      const analysisId = 'test-analysis-uuid-123';

      executeQuery.mockReturnValue(null);

      mockAnalysisService.getConfig.mockResolvedValue({
        version: '5.0',
        analyses: {
          [analysisId]: {
            id: analysisId,
            name: 'test-analysis',
            teamId: 'team-1',
          },
        },
      });

      await expect(
        teamService.moveAnalysisToTeam(analysisId, 'nonexistent'),
      ).rejects.toThrow('Team nonexistent not found');
    });

    it('should skip move if already in target team', async () => {
      const analysisId = 'test-analysis-uuid-123';

      executeQuery.mockReturnValue({ id: 'team-1', name: 'Team 1' });

      mockAnalysisService.getConfig.mockResolvedValue({
        version: '5.0',
        analyses: {
          [analysisId]: {
            id: analysisId,
            name: 'test-analysis',
            teamId: 'team-1',
          },
        },
      });

      const result = await teamService.moveAnalysisToTeam(analysisId, 'team-1');

      expect(result.analysisId).toBe(analysisId);
      expect(result.analysisName).toBe('test-analysis');
      expect(result.from).toBe('team-1');
      expect(result.to).toBe('team-1');
    });
  });

  describe('ensureAnalysisHasTeam', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should assign uncategorized team if no team', async () => {
      executeQueryAll.mockReturnValue([
        { id: 'uncategorized', name: 'Uncategorized' },
      ]);

      mockAnalysisService.getConfig.mockResolvedValue({
        analyses: {
          'test-analysis': { enabled: true },
        },
      });

      await teamService.ensureAnalysisHasTeam('test-analysis');

      expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
    });

    it('should skip if analysis already has team', async () => {
      mockAnalysisService.getConfig.mockResolvedValue({
        analyses: {
          'test-analysis': { teamId: 'team-1' },
        },
      });

      await teamService.ensureAnalysisHasTeam('test-analysis');

      expect(mockAnalysisService.updateConfig).not.toHaveBeenCalled();
    });
  });

  describe('reorderTeams', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should reorder teams by updating orderIndex', async () => {
      const mockDb = {
        prepare: vi.fn((sql) => {
          if (sql.includes('UPDATE')) {
            return { run: vi.fn() };
          }
          return {
            all: vi.fn(() => [
              { id: 'team-2', name: 'Team 2', orderIndex: 0, isSystem: 0 },
              { id: 'team-1', name: 'Team 1', orderIndex: 1, isSystem: 0 },
            ]),
          };
        }),
      };

      executeTransaction.mockImplementation((callback) => callback(mockDb));

      const teams = await teamService.reorderTeams(['team-2', 'team-1']);

      expect(teams).toHaveLength(2);
      expect(teams[0].id).toBe('team-2');
      expect(teams[0].orderIndex).toBe(0);
      expect(teams[1].id).toBe('team-1');
      expect(teams[1].orderIndex).toBe(1);
    });
  });

  describe('getAnalysisCountByTeamId', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should count analyses in team', async () => {
      executeQuery.mockReturnValue({ id: 'team-1', name: 'Team 1' });

      mockAnalysisService.getConfig.mockResolvedValue({
        analyses: {
          a1: { teamId: 'team-1' },
          a2: { teamId: 'team-1' },
          a3: { teamId: 'team-2' },
        },
      });

      const count = await teamService.getAnalysisCountByTeamId('team-1');

      expect(count).toBe(2);
    });

    it('should return 0 on error', async () => {
      executeQuery.mockImplementation(() => {
        throw new Error('Database error');
      });

      const count = await teamService.getAnalysisCountByTeamId('team-1');

      expect(count).toBe(0);
    });
  });

  describe('folder operations', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
      executeQuery.mockReturnValue({ id: 'team-1', name: 'Team 1' });
    });

    describe('traverseTree', () => {
      it('should traverse items and call visitor for each', () => {
        const items = [
          { id: 'item-1', type: 'analysis' },
          { id: 'item-2', type: 'analysis' },
        ];

        const visited = [];
        teamService.traverseTree(items, (item) => {
          visited.push(item.id);
          return null;
        });

        expect(visited).toEqual(['item-1', 'item-2']);
      });

      it('should stop traversal when visitor returns non-null value', () => {
        const items = [
          { id: 'item-1', type: 'analysis' },
          { id: 'item-2', type: 'analysis' },
          { id: 'item-3', type: 'analysis' },
        ];

        const result = teamService.traverseTree(items, (item) => {
          if (item.id === 'item-2') return item;
          return null;
        });

        expect(result.id).toBe('item-2');
      });

      it('should recursively traverse nested folders', () => {
        const items = [
          {
            id: 'folder-1',
            type: 'folder',
            items: [
              { id: 'nested-1', type: 'analysis' },
              {
                id: 'folder-2',
                type: 'folder',
                items: [{ id: 'deeply-nested', type: 'analysis' }],
              },
            ],
          },
        ];

        const visited = [];
        teamService.traverseTree(items, (item) => {
          visited.push(item.id);
          return null;
        });

        expect(visited).toEqual([
          'folder-1',
          'nested-1',
          'folder-2',
          'deeply-nested',
        ]);
      });

      it('should provide parent in visitor callback', () => {
        const items = [
          {
            id: 'folder-1',
            type: 'folder',
            items: [{ id: 'child-1', type: 'analysis' }],
          },
        ];

        let capturedParent = null;
        teamService.traverseTree(items, (item, parent) => {
          if (item.id === 'child-1') {
            capturedParent = parent;
          }
          return null;
        });

        expect(capturedParent.id).toBe('folder-1');
      });

      it('should provide null parent for root items', () => {
        const items = [{ id: 'item-1', type: 'analysis' }];

        let capturedParent = undefined;
        teamService.traverseTree(items, (item, parent) => {
          capturedParent = parent;
          return null;
        });

        expect(capturedParent).toBeNull();
      });

      it('should provide index in visitor callback', () => {
        const items = [
          { id: 'item-1', type: 'analysis' },
          { id: 'item-2', type: 'analysis' },
          { id: 'item-3', type: 'analysis' },
        ];

        const indices = [];
        teamService.traverseTree(items, (item, parent, index) => {
          indices.push(index);
          return null;
        });

        expect(indices).toEqual([0, 1, 2]);
      });

      it('should return null if no visitor returns value', () => {
        const items = [
          { id: 'item-1', type: 'analysis' },
          { id: 'item-2', type: 'analysis' },
        ];

        const result = teamService.traverseTree(items, () => null);

        expect(result).toBeNull();
      });

      it('should handle empty items array', () => {
        const items = [];

        const result = teamService.traverseTree(items, (item) => item);

        expect(result).toBeNull();
      });

      it('should not confuse undefined return with null', () => {
        const items = [
          { id: 'item-1', type: 'analysis' },
          { id: 'item-2', type: 'analysis' },
        ];

        const result = teamService.traverseTree(items, (item) => {
          if (item.id === 'item-2') return undefined;
          return null;
        });

        // Should continue searching past undefined
        expect(result).toBeNull();
      });
    });

    describe('findItemById', () => {
      it('should find item at root level', () => {
        const items = [
          { id: 'item-1', type: 'analysis' },
          { id: 'item-2', type: 'folder', name: 'Folder 1', items: [] },
        ];

        const item = teamService.findItemById(items, 'item-1');

        expect(item.id).toBe('item-1');
      });

      it('should find nested item', () => {
        const items = [
          {
            id: 'folder-1',
            type: 'folder',
            items: [{ id: 'nested-1', type: 'analysis' }],
          },
        ];

        const item = teamService.findItemById(items, 'nested-1');

        expect(item.id).toBe('nested-1');
      });

      it('should return null if not found', () => {
        const items = [{ id: 'item-1', type: 'analysis' }];

        const item = teamService.findItemById(items, 'nonexistent');

        expect(item).toBeNull();
      });
    });

    describe('findItemWithParent', () => {
      it('should find item with parent info', () => {
        const items = [
          {
            id: 'folder-1',
            type: 'folder',
            items: [{ id: 'child-1', type: 'analysis' }],
          },
        ];

        const { parent, item, index } = teamService.findItemWithParent(
          items,
          'child-1',
        );

        expect(parent.id).toBe('folder-1');
        expect(item.id).toBe('child-1');
        expect(index).toBe(0);
      });

      it('should return null parent for root items', () => {
        const items = [{ id: 'item-1', type: 'analysis' }];

        const { parent, item, index } = teamService.findItemWithParent(
          items,
          'item-1',
        );

        expect(parent).toBeNull();
        expect(item.id).toBe('item-1');
        expect(index).toBe(0);
      });
    });

    describe('createFolder', () => {
      it('should create folder at root level', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': { items: [] },
          },
        });

        const folder = await teamService.createFolder(
          'team-1',
          null,
          'New Folder',
        );

        expect(folder.type).toBe('folder');
        expect(folder.name).toBe('New Folder');
        expect(folder.items).toEqual([]);
        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should create nested folder', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                { id: 'parent', type: 'folder', name: 'Parent', items: [] },
              ],
            },
          },
        });

        const folder = await teamService.createFolder(
          'team-1',
          'parent',
          'Nested Folder',
        );

        expect(folder.name).toBe('Nested Folder');
        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should throw error if team not found', async () => {
        executeQuery.mockReturnValue(null);

        await expect(
          teamService.createFolder('nonexistent', null, 'Folder'),
        ).rejects.toThrow('Team nonexistent not found');
      });

      it('should throw error if parent folder not found', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': { items: [] },
          },
        });

        await expect(
          teamService.createFolder('team-1', 'nonexistent', 'Folder'),
        ).rejects.toThrow('Parent folder not found');
      });
    });

    describe('updateFolder', () => {
      it('should update folder properties', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                {
                  id: 'folder-1',
                  type: 'folder',
                  name: 'Old Name',
                  expanded: false,
                },
              ],
            },
          },
        });

        const folder = await teamService.updateFolder('team-1', 'folder-1', {
          name: 'New Name',
          expanded: true,
        });

        expect(folder.name).toBe('New Name');
        expect(folder.expanded).toBe(true);
        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should throw error if folder not found', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': { items: [] },
          },
        });

        await expect(
          teamService.updateFolder('team-1', 'nonexistent', { name: 'Test' }),
        ).rejects.toThrow('Folder nonexistent not found');
      });
    });

    describe('deleteFolder', () => {
      it('should delete folder and move children to parent', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                {
                  id: 'folder-1',
                  type: 'folder',
                  items: [
                    { id: 'child-1', type: 'analysis' },
                    { id: 'child-2', type: 'analysis' },
                  ],
                },
              ],
            },
          },
        });

        const result = await teamService.deleteFolder('team-1', 'folder-1');

        expect(result.deleted).toBe('folder-1');
        expect(result.childrenMoved).toBe(2);
        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should throw error if folder not found', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': { items: [] },
          },
        });

        await expect(
          teamService.deleteFolder('team-1', 'nonexistent'),
        ).rejects.toThrow('Folder nonexistent not found');
      });
    });

    describe('moveItem', () => {
      it('should move item to different folder', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                { id: 'item-1', type: 'analysis' },
                { id: 'folder-1', type: 'folder', items: [] },
              ],
            },
          },
        });

        const result = await teamService.moveItem(
          'team-1',
          'item-1',
          'folder-1',
          0,
        );

        expect(result.moved).toBe('item-1');
        expect(result.to).toBe('folder-1');
        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should move item to root', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                {
                  id: 'folder-1',
                  type: 'folder',
                  items: [{ id: 'item-1', type: 'analysis' }],
                },
              ],
            },
          },
        });

        const result = await teamService.moveItem('team-1', 'item-1', null, 0);

        expect(result.moved).toBe('item-1');
        expect(result.to).toBe('root');
        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should prevent moving folder into itself', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [{ id: 'folder-1', type: 'folder', items: [] }],
            },
          },
        });

        await expect(
          teamService.moveItem('team-1', 'folder-1', 'folder-1', 0),
        ).rejects.toThrow('Cannot move folder into itself');
      });

      it('should prevent moving folder into its descendant', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                {
                  id: 'folder-1',
                  type: 'folder',
                  items: [{ id: 'folder-2', type: 'folder', items: [] }],
                },
              ],
            },
          },
        });

        await expect(
          teamService.moveItem('team-1', 'folder-1', 'folder-2', 0),
        ).rejects.toThrow('Cannot move folder into its own descendant');
      });
    });

    describe('addItemToTeamStructure', () => {
      it('should add item to root', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': { items: [] },
          },
        });

        const newItem = {
          id: 'item-1',
          type: 'analysis',
        };

        await teamService.addItemToTeamStructure('team-1', newItem, null);

        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should add item to folder', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [{ id: 'folder-1', type: 'folder', items: [] }],
            },
          },
        });

        const newItem = {
          id: 'item-1',
          type: 'analysis',
        };

        await teamService.addItemToTeamStructure('team-1', newItem, 'folder-1');

        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should create team structure if missing', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({});

        const newItem = {
          id: 'item-1',
          type: 'analysis',
        };

        await teamService.addItemToTeamStructure('team-1', newItem, null);

        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });
    });

    describe('removeItemFromTeamStructure', () => {
      it('should remove item from root', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [{ id: 'item-1', type: 'analysis' }],
            },
          },
        });

        await teamService.removeItemFromTeamStructure('team-1', 'test');

        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should remove nested item', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                {
                  id: 'folder-1',
                  type: 'folder',
                  items: [{ id: 'item-1', type: 'analysis' }],
                },
              ],
            },
          },
        });

        await teamService.removeItemFromTeamStructure('team-1', 'test');

        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should handle missing team structure', async () => {
        mockAnalysisService.getConfig.mockResolvedValue({});

        await teamService.removeItemFromTeamStructure('team-1', 'test');

        // Should not throw error
        expect(mockAnalysisService.updateConfig).not.toHaveBeenCalled();
      });
    });
  });
});
