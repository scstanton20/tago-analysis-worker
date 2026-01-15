import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createControllerRequest,
  createControllerResponse,
} from '../utils/testHelpers.ts';
import type { Team } from '@tago-analysis-worker/types';

// Local Folder type for tests (not exported from types package)
type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  collapsed: boolean;
};

// Mock dependencies before importing the controller
vi.mock('../../src/services/teamService.ts', () => ({
  teamService: {
    getAllTeams: vi.fn(),
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
    deleteTeam: vi.fn(),
    reorderTeams: vi.fn(),
    moveAnalysisToTeam: vi.fn(),
    getAnalysisCountByTeamId: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveItem: vi.fn(),
  },
}));

vi.mock('../../src/utils/sse/index.ts', () => ({
  sseManager: {
    broadcastToAdminUsers: vi.fn(),
    broadcastAnalysisMove: vi.fn(),
    broadcastToTeamUsers: vi.fn(),
  },
}));

// Mock the notification service functions
vi.mock('../../src/services/analysis/AnalysisNotificationService.ts', () => ({
  broadcastTeamStructureUpdate: vi.fn(),
}));

// Type definitions for mocked services
type MockTeamService = {
  getAllTeams: Mock;
  createTeam: Mock;
  updateTeam: Mock;
  deleteTeam: Mock;
  reorderTeams: Mock;
  moveAnalysisToTeam: Mock;
  getAnalysisCountByTeamId: Mock;
  createFolder: Mock;
  updateFolder: Mock;
  deleteFolder: Mock;
  moveItem: Mock;
};

type MockSSEManager = {
  broadcastToAdminUsers: Mock;
  broadcastAnalysisMove: Mock;
  broadcastToTeamUsers: Mock;
};

// Import after mocks
const { teamService } =
  (await import('../../src/services/teamService.ts')) as unknown as {
    teamService: MockTeamService;
  };
const { sseManager } =
  (await import('../../src/utils/sse/index.ts')) as unknown as {
    sseManager: MockSSEManager;
  };
const { broadcastTeamStructureUpdate } =
  (await import('../../src/services/analysis/AnalysisNotificationService.ts')) as unknown as {
    broadcastTeamStructureUpdate: Mock;
  };
const { TeamController } =
  await import('../../src/controllers/teamController.ts');

describe('TeamController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllTeams', () => {
    it('should retrieve all teams successfully', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockTeams: Team[] = [
        {
          id: 'team-1',
          name: 'Engineering',
          color: '#FF0000',
          orderIndex: 1,
          isSystem: false,
        },
        {
          id: 'team-2',
          name: 'Marketing',
          color: '#00FF00',
          orderIndex: 2,
          isSystem: false,
        },
      ];

      teamService.getAllTeams.mockResolvedValue(mockTeams);

      await TeamController.getAllTeams(req, res);

      expect(teamService.getAllTeams).toHaveBeenCalledWith(req.log);
      expect(res.json).toHaveBeenCalledWith(mockTeams);
    });

    it('should return empty array when no teams exist', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      teamService.getAllTeams.mockResolvedValue([]);

      await TeamController.getAllTeams(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  describe('createTeam', () => {
    it('should create team successfully', async () => {
      const req = createControllerRequest({
        body: {
          name: 'Product Team',
          color: '#0000FF',
          order: 3,
        },
      });
      const res = createControllerResponse();

      const mockTeam: Team = {
        id: 'team-3',
        name: 'Product Team',
        color: '#0000FF',
        orderIndex: 3,
        isSystem: false,
      };

      teamService.createTeam.mockResolvedValue(mockTeam);

      await TeamController.createTeam(req, res);

      expect(teamService.createTeam).toHaveBeenCalledWith(
        {
          name: 'Product Team',
          color: '#0000FF',
          order: 3,
        },
        req.headers,
        req.log,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockTeam);
      expect(sseManager.broadcastToAdminUsers).toHaveBeenCalledWith({
        type: 'teamCreated',
        team: mockTeam,
      });
    });

    it('should create team with minimal fields', async () => {
      const req = createControllerRequest({
        body: {
          name: 'New Team',
        },
      });
      const res = createControllerResponse();

      const mockTeam: Team = {
        id: 'team-4',
        name: 'New Team',
        color: '',
        orderIndex: 0,
        isSystem: false,
      };

      teamService.createTeam.mockResolvedValue(mockTeam);

      await TeamController.createTeam(req, res);

      expect(teamService.createTeam).toHaveBeenCalledWith(
        {
          name: 'New Team',
          color: undefined,
          order: undefined,
        },
        req.headers,
        req.log,
      );
    });
  });

  describe('updateTeam', () => {
    it('should update team successfully', async () => {
      const req = createControllerRequest({
        params: { id: 'team-1' },
        body: {
          name: 'Updated Team',
          color: '#FFFF00',
        },
      });
      const res = createControllerResponse();

      const mockTeam: Team = {
        id: 'team-1',
        name: 'Updated Team',
        color: '#FFFF00',
        orderIndex: 1,
        isSystem: false,
      };

      teamService.updateTeam.mockResolvedValue(mockTeam);

      await TeamController.updateTeam(req, res);

      expect(teamService.updateTeam).toHaveBeenCalledWith(
        'team-1',
        {
          name: 'Updated Team',
          color: '#FFFF00',
        },
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith(mockTeam);
      expect(sseManager.broadcastToTeamUsers).toHaveBeenCalledWith('team-1', {
        type: 'teamUpdated',
        team: mockTeam,
      });
    });
  });

  describe('deleteTeam', () => {
    it('should delete team successfully', async () => {
      const req = createControllerRequest({
        params: { id: 'team-1' },
      });
      const res = createControllerResponse();

      const mockResult = {
        success: true,
        message: 'Team deleted successfully',
      };

      teamService.deleteTeam.mockResolvedValue(mockResult);

      await TeamController.deleteTeam(req, res);

      expect(teamService.deleteTeam).toHaveBeenCalledWith(
        'team-1',
        req.headers,
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(sseManager.broadcastToAdminUsers).toHaveBeenCalledWith({
        type: 'teamDeleted',
        deleted: 'team-1',
      });
    });
  });

  describe('reorderTeams', () => {
    it('should reorder teams successfully', async () => {
      const req = createControllerRequest({
        body: {
          orderedIds: ['team-2', 'team-1', 'team-3'],
        },
      });
      const res = createControllerResponse();

      const mockTeams: Team[] = [
        {
          id: 'team-2',
          name: 'Team 2',
          color: '#FF0000',
          orderIndex: 0,
          isSystem: false,
        },
        {
          id: 'team-1',
          name: 'Team 1',
          color: '#00FF00',
          orderIndex: 1,
          isSystem: false,
        },
        {
          id: 'team-3',
          name: 'Team 3',
          color: '#0000FF',
          orderIndex: 2,
          isSystem: false,
        },
      ];

      teamService.reorderTeams.mockResolvedValue(mockTeams);

      await TeamController.reorderTeams(req, res);

      expect(teamService.reorderTeams).toHaveBeenCalledWith(
        ['team-2', 'team-1', 'team-3'],
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith(mockTeams);
      expect(sseManager.broadcastToAdminUsers).toHaveBeenCalledWith({
        type: 'teamsReordered',
        teams: mockTeams,
      });
    });
  });

  describe('moveAnalysisToTeam', () => {
    it('should move analysis to team successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        body: { teamId: 'team-2' },
      });
      const res = createControllerResponse();

      const mockResult = {
        analysisId,
        analysisName: 'test-analysis',
        from: 'team-1',
        to: 'team-2',
      };

      teamService.moveAnalysisToTeam.mockResolvedValue(mockResult);

      await TeamController.moveAnalysisToTeam(req, res);

      expect(teamService.moveAnalysisToTeam).toHaveBeenCalledWith(
        analysisId,
        'team-2',
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(sseManager.broadcastAnalysisMove).toHaveBeenCalledWith(
        analysisId,
        'test-analysis',
        'team-1',
        'team-2',
      );
      expect(broadcastTeamStructureUpdate).toHaveBeenCalledTimes(2);
    });

    it('should move analysis to "No Team" (null teamId)', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        body: { teamId: null },
      });
      const res = createControllerResponse();

      const mockResult = {
        analysisId,
        analysisName: 'test-analysis',
        from: 'team-1',
        to: null,
      };

      teamService.moveAnalysisToTeam.mockResolvedValue(mockResult);

      await TeamController.moveAnalysisToTeam(req, res);

      expect(teamService.moveAnalysisToTeam).toHaveBeenCalledWith(
        analysisId,
        null,
        req.log,
      );
    });
  });

  describe('getTeamAnalysisCount', () => {
    it('should get analysis count for team', async () => {
      const req = createControllerRequest({
        params: { id: 'team-1' },
      });
      const res = createControllerResponse();

      teamService.getAnalysisCountByTeamId.mockResolvedValue(5);

      await TeamController.getTeamAnalysisCount(req, res);

      expect(teamService.getAnalysisCountByTeamId).toHaveBeenCalledWith(
        'team-1',
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith({ count: 5 });
    });

    it('should return zero count when team has no analyses', async () => {
      const req = createControllerRequest({
        params: { id: 'team-1' },
      });
      const res = createControllerResponse();

      teamService.getAnalysisCountByTeamId.mockResolvedValue(0);

      await TeamController.getTeamAnalysisCount(req, res);

      expect(res.json).toHaveBeenCalledWith({ count: 0 });
    });
  });

  describe('createFolder', () => {
    it('should create folder successfully', async () => {
      const req = createControllerRequest({
        params: { teamId: 'team-1' },
        body: {
          parentFolderId: null,
          name: 'New Folder',
        },
      });
      const res = createControllerResponse();

      const mockFolder: Folder = {
        id: 'folder-1',
        name: 'New Folder',
        parentId: null,
        collapsed: false,
      };

      teamService.createFolder.mockResolvedValue(mockFolder);

      await TeamController.createFolder(req, res);

      expect(teamService.createFolder).toHaveBeenCalledWith(
        'team-1',
        null,
        'New Folder',
        req.log,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockFolder);
      expect(sseManager.broadcastToTeamUsers).toHaveBeenCalledWith('team-1', {
        type: 'folderCreated',
        teamId: 'team-1',
        folder: mockFolder,
      });
      expect(broadcastTeamStructureUpdate).toHaveBeenCalledWith('team-1');
    });

    it('should create nested folder', async () => {
      const req = createControllerRequest({
        params: { teamId: 'team-1' },
        body: {
          parentFolderId: 'folder-1',
          name: 'Nested Folder',
        },
      });
      const res = createControllerResponse();

      const mockFolder: Folder = {
        id: 'folder-2',
        name: 'Nested Folder',
        parentId: 'folder-1',
        collapsed: false,
      };

      teamService.createFolder.mockResolvedValue(mockFolder);

      await TeamController.createFolder(req, res);

      expect(teamService.createFolder).toHaveBeenCalledWith(
        'team-1',
        'folder-1',
        'Nested Folder',
        req.log,
      );
    });
  });

  describe('updateFolder', () => {
    it('should update folder successfully', async () => {
      const req = createControllerRequest({
        params: {
          teamId: 'team-1',
          folderId: 'folder-1',
        },
        body: {
          name: 'Updated Folder',
          collapsed: true,
        },
      });
      const res = createControllerResponse();

      const mockFolder: Folder = {
        id: 'folder-1',
        name: 'Updated Folder',
        collapsed: true,
        parentId: null,
      };

      teamService.updateFolder.mockResolvedValue(mockFolder);

      await TeamController.updateFolder(req, res);

      expect(teamService.updateFolder).toHaveBeenCalledWith(
        'team-1',
        'folder-1',
        {
          name: 'Updated Folder',
          collapsed: true,
        },
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith(mockFolder);
      expect(sseManager.broadcastToTeamUsers).toHaveBeenCalledWith('team-1', {
        type: 'folderUpdated',
        teamId: 'team-1',
        folder: mockFolder,
      });
    });
  });

  describe('deleteFolder', () => {
    it('should delete folder successfully', async () => {
      const req = createControllerRequest({
        params: {
          teamId: 'team-1',
          folderId: 'folder-1',
        },
      });
      const res = createControllerResponse();

      const mockResult = {
        success: true,
        message: 'Folder deleted',
      };

      teamService.deleteFolder.mockResolvedValue(mockResult);

      await TeamController.deleteFolder(req, res);

      expect(teamService.deleteFolder).toHaveBeenCalledWith(
        'team-1',
        'folder-1',
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(sseManager.broadcastToTeamUsers).toHaveBeenCalledWith('team-1', {
        type: 'folderDeleted',
        teamId: 'team-1',
        ...mockResult,
      });
      expect(broadcastTeamStructureUpdate).toHaveBeenCalledWith('team-1');
    });
  });

  describe('moveItem', () => {
    it('should move item successfully', async () => {
      const req = createControllerRequest({
        params: { teamId: 'team-1' },
        body: {
          itemId: 'folder-1',
          newParentId: 'folder-2',
          newIndex: 0,
        },
      });
      const res = createControllerResponse();

      const mockResult = {
        success: true,
        message: 'Item moved',
      };

      teamService.moveItem.mockResolvedValue(mockResult);

      await TeamController.moveItem(req, res);

      expect(teamService.moveItem).toHaveBeenCalledWith(
        'team-1',
        'folder-1',
        'folder-2',
        0,
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(broadcastTeamStructureUpdate).toHaveBeenCalledWith('team-1');
    });

    it('should move item to root level', async () => {
      const req = createControllerRequest({
        params: { teamId: 'team-1' },
        body: {
          itemId: 'folder-1',
          newParentId: null,
          newIndex: 2,
        },
      });
      const res = createControllerResponse();

      const mockResult = {
        success: true,
      };

      teamService.moveItem.mockResolvedValue(mockResult);

      await TeamController.moveItem(req, res);

      expect(teamService.moveItem).toHaveBeenCalledWith(
        'team-1',
        'folder-1',
        null,
        2,
        req.log,
      );
    });
  });
});
