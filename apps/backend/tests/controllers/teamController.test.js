import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../utils/testHelpers.js';

// Mock dependencies before importing the controller
vi.mock('../../src/services/teamService.js', () => ({
  default: {
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

vi.mock('../../src/utils/sse.js', () => ({
  sseManager: {
    broadcastToAdminUsers: vi.fn(),
    broadcastAnalysisMove: vi.fn(),
    broadcastToTeamUsers: vi.fn(),
  },
}));

vi.mock('../../src/utils/responseHelpers.js', () => ({
  handleError: vi.fn((res, error) => {
    res.status(500).json({ error: error.message });
  }),
  broadcastTeamStructureUpdate: vi.fn(),
}));

// Import after mocks
const teamService = (await import('../../src/services/teamService.js')).default;
const { sseManager } = await import('../../src/utils/sse.js');
const { broadcastTeamStructureUpdate } = await import(
  '../../src/utils/responseHelpers.js'
);
const TeamController = (await import('../../src/controllers/teamController.js'))
  .default;

describe('TeamController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllTeams', () => {
    it('should retrieve all teams successfully', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockTeams = [
        { id: 'team-1', name: 'Engineering', color: '#FF0000', order: 1 },
        { id: 'team-2', name: 'Marketing', color: '#00FF00', order: 2 },
      ];

      teamService.getAllTeams.mockResolvedValue(mockTeams);

      await TeamController.getAllTeams(req, res);

      expect(teamService.getAllTeams).toHaveBeenCalledWith(req.log);
      expect(res.json).toHaveBeenCalledWith(mockTeams);
    });

    it('should return empty array when no teams exist', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      teamService.getAllTeams.mockResolvedValue([]);

      await TeamController.getAllTeams(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('should handle errors when retrieving teams', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      teamService.getAllTeams.mockRejectedValue(
        new Error('Failed to retrieve teams'),
      );

      await TeamController.getAllTeams(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createTeam', () => {
    it('should create team successfully', async () => {
      const req = createMockRequest({
        body: {
          name: 'Product Team',
          color: '#0000FF',
          order: 3,
        },
      });
      const res = createMockResponse();

      const mockTeam = {
        id: 'team-3',
        name: 'Product Team',
        color: '#0000FF',
        order: 3,
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
      const req = createMockRequest({
        body: {
          name: 'New Team',
        },
      });
      const res = createMockResponse();

      const mockTeam = {
        id: 'team-4',
        name: 'New Team',
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

    it('should handle errors when creating team', async () => {
      const req = createMockRequest({
        body: {
          name: 'Invalid Team',
        },
      });
      const res = createMockResponse();

      teamService.createTeam.mockRejectedValue(
        new Error('Team creation failed'),
      );

      await TeamController.createTeam(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateTeam', () => {
    it('should update team successfully', async () => {
      const req = createMockRequest({
        params: { id: 'team-1' },
        body: {
          name: 'Updated Team',
          color: '#FFFF00',
        },
      });
      const res = createMockResponse();

      const mockTeam = {
        id: 'team-1',
        name: 'Updated Team',
        color: '#FFFF00',
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
      expect(sseManager.broadcastToAdminUsers).toHaveBeenCalledWith({
        type: 'teamUpdated',
        team: mockTeam,
      });
    });

    it('should handle errors when updating team', async () => {
      const req = createMockRequest({
        params: { id: 'team-1' },
        body: { name: 'New Name' },
      });
      const res = createMockResponse();

      teamService.updateTeam.mockRejectedValue(new Error('Update failed'));

      await TeamController.updateTeam(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('deleteTeam', () => {
    it('should delete team successfully', async () => {
      const req = createMockRequest({
        params: { id: 'team-1' },
      });
      const res = createMockResponse();

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

    it('should handle errors when deleting team', async () => {
      const req = createMockRequest({
        params: { id: 'team-1' },
      });
      const res = createMockResponse();

      teamService.deleteTeam.mockRejectedValue(new Error('Delete failed'));

      await TeamController.deleteTeam(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('reorderTeams', () => {
    it('should reorder teams successfully', async () => {
      const req = createMockRequest({
        body: {
          orderedIds: ['team-2', 'team-1', 'team-3'],
        },
      });
      const res = createMockResponse();

      const mockTeams = [
        { id: 'team-2', order: 0 },
        { id: 'team-1', order: 1 },
        { id: 'team-3', order: 2 },
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

    it('should handle errors when reordering teams', async () => {
      const req = createMockRequest({
        body: {
          orderedIds: ['team-1', 'team-2'],
        },
      });
      const res = createMockResponse();

      teamService.reorderTeams.mockRejectedValue(new Error('Reorder failed'));

      await TeamController.reorderTeams(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('moveAnalysisToTeam', () => {
    it('should move analysis to team successfully', async () => {
      const req = createMockRequest({
        params: { name: 'test-analysis' },
        body: { teamId: 'team-2' },
      });
      const res = createMockResponse();

      const mockResult = {
        analysis: 'test-analysis',
        from: 'team-1',
        to: 'team-2',
      };

      teamService.moveAnalysisToTeam.mockResolvedValue(mockResult);

      await TeamController.moveAnalysisToTeam(req, res);

      expect(teamService.moveAnalysisToTeam).toHaveBeenCalledWith(
        'test-analysis',
        'team-2',
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(sseManager.broadcastAnalysisMove).toHaveBeenCalledWith(
        'test-analysis',
        'team-1',
        'team-2',
      );
      expect(broadcastTeamStructureUpdate).toHaveBeenCalledTimes(2);
    });

    it('should move analysis to "No Team" (null teamId)', async () => {
      const req = createMockRequest({
        params: { name: 'test-analysis' },
        body: { teamId: null },
      });
      const res = createMockResponse();

      const mockResult = {
        analysis: 'test-analysis',
        from: 'team-1',
        to: null,
      };

      teamService.moveAnalysisToTeam.mockResolvedValue(mockResult);

      await TeamController.moveAnalysisToTeam(req, res);

      expect(teamService.moveAnalysisToTeam).toHaveBeenCalledWith(
        'test-analysis',
        null,
        req.log,
      );
    });

    it('should handle errors when moving analysis', async () => {
      const req = createMockRequest({
        params: { name: 'test-analysis' },
        body: { teamId: 'team-2' },
      });
      const res = createMockResponse();

      teamService.moveAnalysisToTeam.mockRejectedValue(
        new Error('Move failed'),
      );

      await TeamController.moveAnalysisToTeam(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getTeamAnalysisCount', () => {
    it('should get analysis count for team', async () => {
      const req = createMockRequest({
        params: { id: 'team-1' },
      });
      const res = createMockResponse();

      teamService.getAnalysisCountByTeamId.mockResolvedValue(5);

      await TeamController.getTeamAnalysisCount(req, res);

      expect(teamService.getAnalysisCountByTeamId).toHaveBeenCalledWith(
        'team-1',
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith({ count: 5 });
    });

    it('should return zero count when team has no analyses', async () => {
      const req = createMockRequest({
        params: { id: 'team-1' },
      });
      const res = createMockResponse();

      teamService.getAnalysisCountByTeamId.mockResolvedValue(0);

      await TeamController.getTeamAnalysisCount(req, res);

      expect(res.json).toHaveBeenCalledWith({ count: 0 });
    });

    it('should handle errors when getting count', async () => {
      const req = createMockRequest({
        params: { id: 'team-1' },
      });
      const res = createMockResponse();

      teamService.getAnalysisCountByTeamId.mockRejectedValue(
        new Error('Count failed'),
      );

      await TeamController.getTeamAnalysisCount(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createFolder', () => {
    it('should create folder successfully', async () => {
      const req = createMockRequest({
        params: { teamId: 'team-1' },
        body: {
          parentFolderId: null,
          name: 'New Folder',
        },
      });
      const res = createMockResponse();

      const mockFolder = {
        id: 'folder-1',
        name: 'New Folder',
        parentId: null,
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
      expect(broadcastTeamStructureUpdate).toHaveBeenCalledWith(
        sseManager,
        'team-1',
      );
    });

    it('should create nested folder', async () => {
      const req = createMockRequest({
        params: { teamId: 'team-1' },
        body: {
          parentFolderId: 'folder-1',
          name: 'Nested Folder',
        },
      });
      const res = createMockResponse();

      const mockFolder = {
        id: 'folder-2',
        name: 'Nested Folder',
        parentId: 'folder-1',
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

    it('should handle errors when creating folder', async () => {
      const req = createMockRequest({
        params: { teamId: 'team-1' },
        body: { name: 'New Folder' },
      });
      const res = createMockResponse();

      teamService.createFolder.mockRejectedValue(
        new Error('Folder creation failed'),
      );

      await TeamController.createFolder(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateFolder', () => {
    it('should update folder successfully', async () => {
      const req = createMockRequest({
        params: {
          teamId: 'team-1',
          folderId: 'folder-1',
        },
        body: {
          name: 'Updated Folder',
          collapsed: true,
        },
      });
      const res = createMockResponse();

      const mockFolder = {
        id: 'folder-1',
        name: 'Updated Folder',
        collapsed: true,
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

    it('should handle errors when updating folder', async () => {
      const req = createMockRequest({
        params: {
          teamId: 'team-1',
          folderId: 'folder-1',
        },
        body: { name: 'New Name' },
      });
      const res = createMockResponse();

      teamService.updateFolder.mockRejectedValue(new Error('Update failed'));

      await TeamController.updateFolder(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('deleteFolder', () => {
    it('should delete folder successfully', async () => {
      const req = createMockRequest({
        params: {
          teamId: 'team-1',
          folderId: 'folder-1',
        },
      });
      const res = createMockResponse();

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
      expect(broadcastTeamStructureUpdate).toHaveBeenCalledWith(
        sseManager,
        'team-1',
      );
    });

    it('should handle errors when deleting folder', async () => {
      const req = createMockRequest({
        params: {
          teamId: 'team-1',
          folderId: 'folder-1',
        },
      });
      const res = createMockResponse();

      teamService.deleteFolder.mockRejectedValue(new Error('Delete failed'));

      await TeamController.deleteFolder(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('moveItem', () => {
    it('should move item successfully', async () => {
      const req = createMockRequest({
        params: { teamId: 'team-1' },
        body: {
          itemId: 'folder-1',
          newParentId: 'folder-2',
          newIndex: 0,
        },
      });
      const res = createMockResponse();

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
      expect(broadcastTeamStructureUpdate).toHaveBeenCalledWith(
        sseManager,
        'team-1',
      );
    });

    it('should move item to root level', async () => {
      const req = createMockRequest({
        params: { teamId: 'team-1' },
        body: {
          itemId: 'folder-1',
          newParentId: null,
          newIndex: 2,
        },
      });
      const res = createMockResponse();

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

    it('should handle errors when moving item', async () => {
      const req = createMockRequest({
        params: { teamId: 'team-1' },
        body: {
          itemId: 'folder-1',
          newParentId: 'folder-2',
          newIndex: 0,
        },
      });
      const res = createMockResponse();

      teamService.moveItem.mockRejectedValue(new Error('Move failed'));

      await TeamController.moveItem(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
