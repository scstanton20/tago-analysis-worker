import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTempStorage,
  type TempStorage,
} from '../fixtures/tempStorage.ts';
import { AUTH_SCHEMA } from '../fixtures/testDatabase.ts';
import type {
  FolderStructureItem,
  TeamStructureItem,
} from '@tago-analysis-worker/types';

// Temp storage created in beforeEach
let tempStorage: TempStorage;

// Mock only config to point to temp directory
vi.mock('../../src/config/default.ts', () => ({
  config: {
    storage: {
      get base() {
        return tempStorage.basePath;
      },
      analyses: 'analyses',
      config: 'config',
    },
    auth: {
      secret: 'test-secret-key-for-testing-purposes-only',
    },
    server: {
      port: 3000,
    },
    logging: {
      level: 'silent',
    },
  },
}));

// Mock logger to suppress output during tests
vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock auth library (external dependency - better-auth)
vi.mock('../../src/lib/auth.ts', () => ({
  auth: {
    api: {
      createTeam: vi.fn(),
      removeTeam: vi.fn(),
    },
  },
}));

type MockAnalysisService = {
  getConfig: () => Promise<{
    version: string;
    analyses: Record<
      string,
      { teamId?: string; name?: string; enabled?: boolean }
    >;
    teamStructure: Record<
      string,
      { items: Array<{ id: string; type: string }> }
    >;
  }>;
  updateConfig: (config: unknown) => Promise<void>;
};

type Team = {
  id: string;
  name: string;
  organizationId: string;
  color: string;
  orderIndex: number;
  isSystem: boolean;
  createdAt?: string;
};

// Use shared types from @tago-analysis-worker/types
type Folder = FolderStructureItem;
type TreeItem = TeamStructureItem;

type TeamServiceType = {
  initialized: boolean;
  analysisService: MockAnalysisService | null;
  organizationId: string | null;
  initialize: (analysisService: MockAnalysisService) => Promise<void>;
  getAllTeams: () => Promise<Team[]>;
  getTeam: (teamId: string) => Promise<Team | undefined>;
  createTeam: (options: {
    name: string;
    color?: string;
    order?: number;
  }) => Promise<Team>;
  updateTeam: (
    teamId: string,
    updates: { name?: string; color?: string; order?: number },
  ) => Promise<Team | null>;
  deleteTeam: (teamId: string) => Promise<{ deleted: string; name: string }>;
  getAnalysesByTeam: (
    teamId: string,
  ) => Promise<Array<{ name: string; enabled?: boolean }>>;
  moveAnalysisToTeam: (
    analysisId: string,
    teamId: string,
  ) => Promise<{
    analysisId: string;
    analysisName: string;
    from: string;
    to: string;
  }>;
  ensureAnalysisHasTeam: (analysisId: string) => Promise<void>;
  reorderTeams: (teamIds: string[]) => Promise<Team[]>;
  getAnalysisCountByTeamId: (teamId: string) => Promise<number>;
  traverseTree: <T>(
    items: TreeItem[],
    visitor: (item: TreeItem, parent: Folder | null, index: number) => T | null,
  ) => T | null;
  findItemById: (items: TreeItem[], id: string) => TreeItem | null;
  findItemWithParent: (
    items: TreeItem[],
    id: string,
  ) => { parent: Folder | null; item: TreeItem; index: number };
  createFolder: (
    teamId: string,
    parentId: string | null,
    name: string,
  ) => Promise<Folder>;
  updateFolder: (
    teamId: string,
    folderId: string,
    updates: { name?: string; expanded?: boolean },
  ) => Promise<Folder>;
  deleteFolder: (
    teamId: string,
    folderId: string,
  ) => Promise<{ deleted: string; childrenMoved: number }>;
  moveItem: (
    teamId: string,
    itemId: string,
    targetFolderId: string | null,
    position: number,
  ) => Promise<{ moved: string; to: string }>;
  addItemToTeamStructure: (
    teamId: string,
    item: TreeItem,
    parentId: string | null,
  ) => Promise<void>;
  removeItemFromTeamStructure: (
    teamId: string,
    analysisName: string,
  ) => Promise<void>;
};

describe('TeamService', () => {
  let teamService: TeamServiceType;
  let mockAnalysisService: MockAnalysisService;
  let auth: {
    api: {
      createTeam: ReturnType<typeof vi.fn>;
      removeTeam: ReturnType<typeof vi.fn>;
    };
  };
  let organizationId: string;
  let getAuthDatabase: () => import('better-sqlite3').Database;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Create fresh temp storage for each test
    tempStorage?.cleanup();
    tempStorage = createTempStorage('teamService-test-');

    // Import auth mock
    auth = (await import('../../src/lib/auth.ts'))
      .auth as unknown as typeof auth;

    // Import real authDatabase - this will create a real SQLite file in temp dir
    const authDatabase = await import('../../src/utils/authDatabase.ts');
    getAuthDatabase = authDatabase.getAuthDatabase;

    // Initialize the database schema
    const db = getAuthDatabase();
    db.exec(AUTH_SCHEMA);

    // Create main organization
    organizationId = `org_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    db.prepare(
      `INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)`,
    ).run(organizationId, 'Main Organization', 'main');

    // Create mock analysis service for config operations
    mockAnalysisService = {
      getConfig: vi.fn().mockResolvedValue({
        version: '5.0',
        analyses: {},
        teamStructure: {},
      }),
      updateConfig: vi.fn().mockResolvedValue(undefined),
    };

    // Re-import to get fresh instance
    const { teamService: service } =
      await import('../../src/services/teamService.ts');
    teamService = service as unknown as TeamServiceType;

    // Reset service state
    teamService.initialized = false;
    teamService.analysisService = null;
    teamService.organizationId = null;
  });

  afterEach(() => {
    // Close database connection to allow file cleanup
    try {
      const db = getAuthDatabase();
      db.close();
    } catch {
      // Ignore if already closed
    }
    // Cleanup temp storage
    tempStorage?.cleanup();
  });

  describe('initialize', () => {
    it('should initialize with analysis service', async () => {
      await teamService.initialize(mockAnalysisService);

      expect(teamService.initialized).toBe(true);
      expect(teamService.analysisService).toBe(mockAnalysisService);
      expect(teamService.organizationId).toBe(organizationId);
    });

    it('should skip initialization if already initialized', async () => {
      await teamService.initialize(mockAnalysisService);
      const firstOrgId = teamService.organizationId;

      await teamService.initialize(mockAnalysisService);

      expect(teamService.organizationId).toBe(firstOrgId);
    });

    it('should throw error if organization not found', async () => {
      // Delete the organization
      const db = getAuthDatabase();
      db.prepare('DELETE FROM organization').run();

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
      // Create test teams directly in database
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Uncategorized', organizationId, '#3B82F6', 0, 1);
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-2', 'Team Alpha', organizationId, '#10B981', 1, 0);

      const teams = await teamService.getAllTeams();

      expect(teams).toHaveLength(2);
      expect(teams[0].isSystem).toBe(true);
      expect(teams[0].orderIndex).toBe(0);
      expect(teams[1].isSystem).toBe(false);
      expect(teams[1].orderIndex).toBe(1);
    });

    it('should return empty array if no teams', async () => {
      const teams = await teamService.getAllTeams();

      expect(teams).toEqual([]);
    });
  });

  describe('getTeam', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should get specific team by ID', async () => {
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Team Alpha', organizationId, '#10B981', 1, 0);

      const team = await teamService.getTeam('team-1');

      expect(team?.id).toBe('team-1');
      expect(team?.name).toBe('Team Alpha');
      expect(team?.isSystem).toBe(false);
      expect(team?.orderIndex).toBe(1);
    });

    it('should return undefined if team not found', async () => {
      const team = await teamService.getTeam('nonexistent');

      expect(team).toBeUndefined();
    });
  });

  describe('createTeam', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should create new team via better-auth API', async () => {
      auth.api.createTeam.mockResolvedValue({
        id: 'team-new',
        name: 'New Team',
        organizationId,
        createdAt: new Date(),
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
          organizationId,
          color: '#3B82F6',
          order_index: 0,
          is_system: false,
        },
        headers: {},
      });
    });

    it('should throw error if team name already exists', async () => {
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('existing-team', 'Existing Team', organizationId, '#3B82F6', 0, 0);

      await expect(
        teamService.createTeam({ name: 'Existing Team' }),
      ).rejects.toThrow('Team with name "Existing Team" already exists');
    });

    it('should handle custom color and order', async () => {
      auth.api.createTeam.mockResolvedValue({
        id: 'team-new',
        name: 'Custom Team',
        organizationId,
        createdAt: new Date(),
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
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Old Name', organizationId, '#3B82F6', 0, 0);

      const team = await teamService.updateTeam('team-1', {
        name: 'Updated Team',
        color: '#10B981',
      });

      expect(team?.name).toBe('Updated Team');
      expect(team?.color).toBe('#10B981');
      expect(team?.isSystem).toBe(false);
    });

    it('should throw error if team not found', async () => {
      await expect(
        teamService.updateTeam('nonexistent', { name: 'Test' }),
      ).rejects.toThrow('Team nonexistent not found');
    });

    it('should throw error if no valid fields to update', async () => {
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Team 1', organizationId, '#3B82F6', 0, 0);

      await expect(
        teamService.updateTeam('team-1', { invalid: 'field' } as unknown as {
          name?: string;
        }),
      ).rejects.toThrow('No valid fields to update');
    });

    it('should update orderIndex', async () => {
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Team 1', organizationId, '#3B82F6', 0, 0);

      const team = await teamService.updateTeam('team-1', { order: 5 });

      expect(team?.orderIndex).toBe(5);
    });
  });

  describe('deleteTeam', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
    });

    it('should delete team via better-auth API', async () => {
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Team to Delete', organizationId, '#3B82F6', 0, 0);

      auth.api.removeTeam.mockResolvedValue(null);

      const result = await teamService.deleteTeam('team-1');

      expect(result.deleted).toBe('team-1');
      expect(result.name).toBe('Team to Delete');
      expect(auth.api.removeTeam).toHaveBeenCalledWith({
        body: { teamId: 'team-1', organizationId },
        headers: {},
      });
    });

    it('should throw error if team not found', async () => {
      await expect(teamService.deleteTeam('nonexistent')).rejects.toThrow(
        'Team nonexistent not found',
      );
    });

    it('should throw error on better-auth API failure', async () => {
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Team 1', organizationId, '#3B82F6', 0, 0);

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
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Team 1', organizationId, '#3B82F6', 0, 0);

      mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
        analyses: {
          'analysis-1': { name: 'analysis-1', teamId: 'team-1', enabled: true },
          'analysis-2': {
            name: 'analysis-2',
            teamId: 'team-1',
            enabled: false,
          },
          'analysis-3': { name: 'analysis-3', teamId: 'team-2', enabled: true },
        },
      });

      const analyses = await teamService.getAnalysesByTeam('team-1');

      expect(analyses).toHaveLength(2);
      expect(analyses[0].name).toBe('analysis-1');
      expect(analyses[1].name).toBe('analysis-2');
    });

    it('should throw error if team not found', async () => {
      await expect(
        teamService.getAnalysesByTeam('nonexistent'),
      ).rejects.toThrow('Team nonexistent not found');
    });

    it('should return empty array if no analyses', async () => {
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Team 1', organizationId, '#3B82F6', 0, 0);

      mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
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
      const db = getAuthDatabase();

      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-2', 'Team 2', organizationId, '#3B82F6', 0, 0);

      mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
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
      mockAnalysisService.getConfig = vi
        .fn()
        .mockResolvedValue({ analyses: {} });

      await expect(
        teamService.moveAnalysisToTeam('nonexistent-uuid', 'team-1'),
      ).rejects.toThrow('Analysis nonexistent-uuid not found');
    });

    it('should throw error if target team not found', async () => {
      const analysisId = 'test-analysis-uuid-123';

      mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
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
      const db = getAuthDatabase();

      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Team 1', organizationId, '#3B82F6', 0, 0);

      mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
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
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('uncategorized', 'Uncategorized', organizationId, '#3B82F6', 0, 1);

      mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
        analyses: {
          'test-analysis': { enabled: true },
        },
      });

      await teamService.ensureAnalysisHasTeam('test-analysis');

      expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
    });

    it('should skip if analysis already has team', async () => {
      mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
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
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Team 1', organizationId, '#3B82F6', 0, 0);
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-2', 'Team 2', organizationId, '#10B981', 1, 0);

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
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Team 1', organizationId, '#3B82F6', 0, 0);

      mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
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
      // Team doesn't exist, should return 0
      const count = await teamService.getAnalysisCountByTeamId('nonexistent');

      expect(count).toBe(0);
    });
  });

  describe('folder operations', () => {
    beforeEach(async () => {
      await teamService.initialize(mockAnalysisService);
      const db = getAuthDatabase();
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('team-1', 'Team 1', organizationId, '#3B82F6', 0, 0);
    });

    describe('traverseTree', () => {
      it('should traverse items and call visitor for each', () => {
        const items: TreeItem[] = [
          { id: 'item-1', type: 'analysis' },
          { id: 'item-2', type: 'analysis' },
        ];

        const visited: string[] = [];
        teamService.traverseTree(items, (item) => {
          visited.push(item.id);
          return null;
        });

        expect(visited).toEqual(['item-1', 'item-2']);
      });

      it('should stop traversal when visitor returns non-null value', () => {
        const items: TreeItem[] = [
          { id: 'item-1', type: 'analysis' },
          { id: 'item-2', type: 'analysis' },
          { id: 'item-3', type: 'analysis' },
        ];

        const result = teamService.traverseTree(items, (item) => {
          if (item.id === 'item-2') return item;
          return null;
        });

        expect(result?.id).toBe('item-2');
      });

      it('should recursively traverse nested folders', () => {
        const items: TreeItem[] = [
          {
            id: 'folder-1',
            type: 'folder',
            name: 'Folder 1',
            items: [
              { id: 'nested-1', type: 'analysis' },
              {
                id: 'folder-2',
                type: 'folder',
                name: 'Folder 2',
                items: [{ id: 'deeply-nested', type: 'analysis' }],
              },
            ],
          },
        ];

        const visited: string[] = [];
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
        const items: TreeItem[] = [
          {
            id: 'folder-1',
            type: 'folder',
            name: 'Folder 1',
            items: [{ id: 'child-1', type: 'analysis' }],
          },
        ];

        let capturedParent: Folder | null = null;
        teamService.traverseTree(items, (item, parent) => {
          if (item.id === 'child-1') {
            capturedParent = parent;
          }
          return null;
        });

        expect((capturedParent as Folder | null)?.id).toBe('folder-1');
      });

      it('should provide null parent for root items', () => {
        const items: TreeItem[] = [{ id: 'item-1', type: 'analysis' }];

        let capturedParent: Folder | null | undefined = undefined;
        teamService.traverseTree(items, (_item, parent) => {
          capturedParent = parent;
          return null;
        });

        expect(capturedParent).toBeNull();
      });

      it('should provide index in visitor callback', () => {
        const items: TreeItem[] = [
          { id: 'item-1', type: 'analysis' },
          { id: 'item-2', type: 'analysis' },
          { id: 'item-3', type: 'analysis' },
        ];

        const indices: number[] = [];
        teamService.traverseTree(items, (_item, _parent, index) => {
          indices.push(index);
          return null;
        });

        expect(indices).toEqual([0, 1, 2]);
      });

      it('should return null if no visitor returns value', () => {
        const items: TreeItem[] = [
          { id: 'item-1', type: 'analysis' },
          { id: 'item-2', type: 'analysis' },
        ];

        const result = teamService.traverseTree(items, () => null);

        expect(result).toBeNull();
      });

      it('should handle empty items array', () => {
        const items: TreeItem[] = [];

        const result = teamService.traverseTree(items, (item) => item);

        expect(result).toBeNull();
      });
    });

    describe('findItemById', () => {
      it('should find item at root level', () => {
        const items: TreeItem[] = [
          { id: 'item-1', type: 'analysis' },
          { id: 'folder-1', type: 'folder', name: 'Folder 1', items: [] },
        ];

        const item = teamService.findItemById(items, 'item-1');

        expect(item?.id).toBe('item-1');
      });

      it('should find nested item', () => {
        const items: TreeItem[] = [
          {
            id: 'folder-1',
            type: 'folder',
            name: 'Folder 1',
            items: [{ id: 'nested-1', type: 'analysis' }],
          },
        ];

        const item = teamService.findItemById(items, 'nested-1');

        expect(item?.id).toBe('nested-1');
      });

      it('should return null if not found', () => {
        const items: TreeItem[] = [{ id: 'item-1', type: 'analysis' }];

        const item = teamService.findItemById(items, 'nonexistent');

        expect(item).toBeNull();
      });
    });

    describe('findItemWithParent', () => {
      it('should find item with parent info', () => {
        const items: TreeItem[] = [
          {
            id: 'folder-1',
            type: 'folder',
            name: 'Folder 1',
            items: [{ id: 'child-1', type: 'analysis' }],
          },
        ];

        const { parent, item, index } = teamService.findItemWithParent(
          items,
          'child-1',
        );

        expect(parent?.id).toBe('folder-1');
        expect(item?.id).toBe('child-1');
        expect(index).toBe(0);
      });

      it('should return null parent for root items', () => {
        const items: TreeItem[] = [{ id: 'item-1', type: 'analysis' }];

        const { parent, item, index } = teamService.findItemWithParent(
          items,
          'item-1',
        );

        expect(parent).toBeNull();
        expect(item?.id).toBe('item-1');
        expect(index).toBe(0);
      });
    });

    describe('createFolder', () => {
      it('should create folder at root level', async () => {
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
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
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
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
        const db = getAuthDatabase();
        db.prepare('DELETE FROM team').run();

        await expect(
          teamService.createFolder('nonexistent', null, 'Folder'),
        ).rejects.toThrow('Team nonexistent not found');
      });

      it('should throw error if parent folder not found', async () => {
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
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
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                {
                  id: 'folder-1',
                  type: 'folder',
                  name: 'Old Name',
                  expanded: false,
                  items: [],
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
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
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
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                {
                  id: 'folder-1',
                  type: 'folder',
                  name: 'Folder 1',
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
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
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
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                { id: 'item-1', type: 'analysis' },
                { id: 'folder-1', type: 'folder', name: 'Folder 1', items: [] },
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
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                {
                  id: 'folder-1',
                  type: 'folder',
                  name: 'Folder 1',
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
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                { id: 'folder-1', type: 'folder', name: 'Folder 1', items: [] },
              ],
            },
          },
        });

        await expect(
          teamService.moveItem('team-1', 'folder-1', 'folder-1', 0),
        ).rejects.toThrow('Cannot move folder into itself');
      });

      it('should prevent moving folder into its descendant', async () => {
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                {
                  id: 'folder-1',
                  type: 'folder',
                  name: 'Folder 1',
                  items: [
                    {
                      id: 'folder-2',
                      type: 'folder',
                      name: 'Folder 2',
                      items: [],
                    },
                  ],
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
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
          teamStructure: {
            'team-1': { items: [] },
          },
        });

        const newItem: TreeItem = {
          id: 'item-1',
          type: 'analysis',
        };

        await teamService.addItemToTeamStructure('team-1', newItem, null);

        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should add item to folder', async () => {
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                { id: 'folder-1', type: 'folder', name: 'Folder 1', items: [] },
              ],
            },
          },
        });

        const newItem: TreeItem = {
          id: 'item-1',
          type: 'analysis',
        };

        await teamService.addItemToTeamStructure('team-1', newItem, 'folder-1');

        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should create team structure if missing', async () => {
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({});

        const newItem: TreeItem = {
          id: 'item-1',
          type: 'analysis',
        };

        await teamService.addItemToTeamStructure('team-1', newItem, null);

        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });
    });

    describe('removeItemFromTeamStructure', () => {
      it('should remove item from root', async () => {
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [{ id: 'item-1', type: 'analysis' }],
            },
          },
        });

        await teamService.removeItemFromTeamStructure('team-1', 'item-1');

        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should remove nested item', async () => {
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({
          teamStructure: {
            'team-1': {
              items: [
                {
                  id: 'folder-1',
                  type: 'folder',
                  name: 'Folder 1',
                  items: [{ id: 'item-1', type: 'analysis' }],
                },
              ],
            },
          },
        });

        await teamService.removeItemFromTeamStructure('team-1', 'item-1');

        expect(mockAnalysisService.updateConfig).toHaveBeenCalled();
      });

      it('should handle missing team structure', async () => {
        mockAnalysisService.getConfig = vi.fn().mockResolvedValue({});

        await teamService.removeItemFromTeamStructure('team-1', 'test');

        // Should not throw error
        expect(mockAnalysisService.updateConfig).not.toHaveBeenCalled();
      });
    });
  });
});
