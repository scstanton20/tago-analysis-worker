import { describe, it, expect } from 'vitest';
import { teamValidationSchemas as schemas } from '../../src/validation/teamSchemas.ts';

describe('teamSchemas', () => {
  describe('getAllTeams', () => {
    it('should accept empty query object', () => {
      const validData = {};

      const result = schemas.getAllTeams.query!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should reject unexpected query parameters', () => {
      const invalidData = { unexpected: 'value' };

      const result = schemas.getAllTeams.query!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('createTeam', () => {
    it('should validate with all required fields', () => {
      const validData = {
        name: 'New Team',
        color: '#FF5733',
      };

      const result = schemas.createTeam.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should require name field', () => {
      const invalidData = {
        color: '#FF5733',
      };

      const result = schemas.createTeam.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('name');
    });

    it('should allow optional color field', () => {
      const validData = {
        name: 'New Team',
      };

      const result = schemas.createTeam.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const invalidData = {
        name: '',
        color: '#FF5733',
      };

      const result = schemas.createTeam.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('name');
    });

    it('should reject invalid hex color format', () => {
      const invalidData = {
        name: 'New Team',
        color: 'red',
      };

      const result = schemas.createTeam.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('color');
    });

    it('should reject hex color without hash', () => {
      const invalidData = {
        name: 'New Team',
        color: 'FF5733',
      };

      const result = schemas.createTeam.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject 3-digit hex colors', () => {
      const invalidData = {
        name: 'New Team',
        color: '#F53',
      };

      const result = schemas.createTeam.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject hex color with invalid characters', () => {
      const invalidData = {
        name: 'New Team',
        color: '#GHIJKL',
      };

      const result = schemas.createTeam.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should allow optional description', () => {
      const validData = {
        name: 'New Team',
        description: 'Team description',
      };

      const result = schemas.createTeam.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should allow optional order', () => {
      const validData = {
        name: 'New Team',
        order: 5,
      };

      const result = schemas.createTeam.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });
  });

  describe('updateTeam', () => {
    it('should validate with valid update data', () => {
      const validData = {
        params: { id: 'team-123' },
        body: { name: 'Updated Team', color: '#00FF00' },
      };

      const paramsResult = schemas.updateTeam.params!.safeParse(
        validData.params,
      );
      const bodyResult = schemas.updateTeam.body!.safeParse(validData.body);

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should require id in params', () => {
      const invalidData = {};

      const result = schemas.updateTeam.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('id');
    });

    it('should allow partial update (name only)', () => {
      const validData = {
        name: 'Updated Name Only',
      };

      const result = schemas.updateTeam.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should allow partial update (color only)', () => {
      const validData = {
        color: '#0000FF',
      };

      const result = schemas.updateTeam.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should reject empty body', () => {
      const invalidData = {};

      const result = schemas.updateTeam.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('deleteTeam', () => {
    it('should validate with valid id', () => {
      const validData = {
        id: 'team-123',
      };

      const result = schemas.deleteTeam.params!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require id', () => {
      const invalidData = {};

      const result = schemas.deleteTeam.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('id');
    });

    it('should reject empty id', () => {
      const invalidData = {
        id: '',
      };

      const result = schemas.deleteTeam.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('getTeamAnalysisCount', () => {
    it('should validate with valid team id', () => {
      const validData = { id: 'team-123' };

      const result = schemas.getTeamAnalysisCount.params!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require id', () => {
      const invalidData = {};

      const result =
        schemas.getTeamAnalysisCount.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('moveAnalysisToTeam', () => {
    it('should validate with valid data', () => {
      const validData = {
        params: { analysisId: '550e8400-e29b-41d4-a716-446655440000' },
        body: { teamId: 'team-456' },
      };

      const paramsResult = schemas.moveAnalysisToTeam.params!.safeParse(
        validData.params,
      );
      const bodyResult = schemas.moveAnalysisToTeam.body!.safeParse(
        validData.body,
      );

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should require analysisId in params', () => {
      const invalidData = {};

      const result = schemas.moveAnalysisToTeam.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should require teamId in body', () => {
      const invalidData = {};

      const result = schemas.moveAnalysisToTeam.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject invalid UUID for analysisId', () => {
      const invalidData = {
        analysisId: 'not-a-uuid',
      };

      const result = schemas.moveAnalysisToTeam.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('reorderTeams', () => {
    it('should validate with valid ordered ids', () => {
      const validData = {
        orderedIds: ['team-1', 'team-2', 'team-3'],
      };

      const result = schemas.reorderTeams.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require orderedIds array', () => {
      const invalidData = {};

      const result = schemas.reorderTeams.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject empty orderedIds array', () => {
      const invalidData = {
        orderedIds: [],
      };

      const result = schemas.reorderTeams.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('addItemToStructure', () => {
    it('should validate with valid item data', () => {
      const validData = {
        params: { teamId: 'team-123' },
        body: { type: 'analysis', id: 'item-456' },
      };

      const paramsResult = schemas.addItemToStructure.params!.safeParse(
        validData.params,
      );
      const bodyResult = schemas.addItemToStructure.body!.safeParse(
        validData.body,
      );

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should accept folder type', () => {
      const validData = {
        type: 'folder',
        id: 'folder-123',
      };

      const result = schemas.addItemToStructure.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should reject invalid type', () => {
      const invalidData = {
        type: 'invalid',
        id: 'item-123',
      };

      const result = schemas.addItemToStructure.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should allow optional parentId', () => {
      const validData = {
        type: 'analysis',
        id: 'item-123',
        parentId: 'parent-folder-456',
      };

      const result = schemas.addItemToStructure.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should allow null parentId', () => {
      const validData = {
        type: 'analysis',
        id: 'item-123',
        parentId: null,
      };

      const result = schemas.addItemToStructure.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });
  });

  describe('removeItemFromStructure', () => {
    it('should validate with valid params', () => {
      const validData = {
        teamId: 'team-123',
        itemId: 'item-456',
      };

      const result =
        schemas.removeItemFromStructure.params!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require teamId', () => {
      const invalidData = { itemId: 'item-456' };

      const result =
        schemas.removeItemFromStructure.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should require itemId', () => {
      const invalidData = { teamId: 'team-123' };

      const result =
        schemas.removeItemFromStructure.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('createFolder', () => {
    it('should validate with valid folder data', () => {
      const validData = {
        params: { teamId: 'team-123' },
        body: { name: 'New Folder' },
      };

      const paramsResult = schemas.createFolder.params!.safeParse(
        validData.params,
      );
      const bodyResult = schemas.createFolder.body!.safeParse(validData.body);

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should require teamId in params', () => {
      const invalidData = {};

      const result = schemas.createFolder.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('teamId');
    });

    it('should require name in body', () => {
      const invalidData = {};

      const result = schemas.createFolder.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('name');
    });

    it('should reject empty name', () => {
      const invalidData = {
        name: '',
      };

      const result = schemas.createFolder.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should allow optional parentFolderId', () => {
      const validData = {
        name: 'Nested Folder',
        parentFolderId: 'parent-folder-123',
      };

      const result = schemas.createFolder.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should allow null parentFolderId', () => {
      const validData = {
        name: 'Root Folder',
        parentFolderId: null,
      };

      const result = schemas.createFolder.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });
  });

  describe('updateFolder', () => {
    it('should validate with valid update data', () => {
      const validData = {
        params: { teamId: 'team-123', folderId: 'folder-456' },
        body: { name: 'Updated Folder Name' },
      };

      const paramsResult = schemas.updateFolder.params!.safeParse(
        validData.params,
      );
      const bodyResult = schemas.updateFolder.body!.safeParse(validData.body);

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should require teamId in params', () => {
      const invalidData = {
        folderId: 'folder-456',
      };

      const result = schemas.updateFolder.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('teamId');
    });

    it('should require folderId in params', () => {
      const invalidData = {
        teamId: 'team-123',
      };

      const result = schemas.updateFolder.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('folderId');
    });

    it('should require name in body', () => {
      const invalidData = {};

      const result = schemas.updateFolder.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('name');
    });
  });

  describe('deleteFolder', () => {
    it('should validate with valid params', () => {
      const validData = {
        teamId: 'team-123',
        folderId: 'folder-456',
      };

      const result = schemas.deleteFolder.params!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require teamId', () => {
      const invalidData = {
        folderId: 'folder-456',
      };

      const result = schemas.deleteFolder.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should require folderId', () => {
      const invalidData = {
        teamId: 'team-123',
      };

      const result = schemas.deleteFolder.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('moveItem', () => {
    it('should validate with valid move data', () => {
      const validData = {
        params: { teamId: 'team-123' },
        body: { itemId: 'item-456' },
      };

      const paramsResult = schemas.moveItem.params!.safeParse(validData.params);
      const bodyResult = schemas.moveItem.body!.safeParse(validData.body);

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should require teamId in params', () => {
      const invalidData = {};

      const result = schemas.moveItem.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should require itemId in body', () => {
      const invalidData = {};

      const result = schemas.moveItem.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should allow optional newParentId', () => {
      const validData = {
        itemId: 'item-456',
        newParentId: 'folder-789',
      };

      const result = schemas.moveItem.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should allow null newParentId (move to root)', () => {
      const validData = {
        itemId: 'item-456',
        newParentId: null,
      };

      const result = schemas.moveItem.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should allow optional newIndex', () => {
      const validData = {
        itemId: 'item-456',
        newIndex: 5,
      };

      const result = schemas.moveItem.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should reject negative newIndex', () => {
      const invalidData = {
        itemId: 'item-456',
        newIndex: -1,
      };

      const result = schemas.moveItem.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });
});
