import { describe, it, expect, beforeEach } from 'vitest';

describe('teamSchemas', () => {
  let schemas;

  beforeEach(async () => {
    const module = await import('../../src/validation/teamSchemas.js');
    schemas = module.teamValidationSchemas;
  });

  describe('createTeam', () => {
    describe('name field', () => {
      it('should validate with valid team name', () => {
        const validData = {
          name: 'Development Team',
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with single character name', () => {
        const validData = {
          name: 'A',
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with maximum length name (100 chars)', () => {
        const validData = {
          name: 'a'.repeat(100),
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should require name field', () => {
        const invalidData = {};

        const result = schemas.createTeam.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('name');
      });

      it('should reject empty name', () => {
        const invalidData = {
          name: '',
        };

        const result = schemas.createTeam.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('name');
        expect(result.error?.issues[0].message).toContain('required');
      });

      it('should reject name exceeding 100 characters', () => {
        const invalidData = {
          name: 'a'.repeat(101),
        };

        const result = schemas.createTeam.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('name');
        expect(result.error?.issues[0].message).toContain('less than 100');
      });

      it('should reject non-string name', () => {
        const invalidData = {
          name: 123,
        };

        const result = schemas.createTeam.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('name');
      });
    });

    describe('description field', () => {
      it('should validate with valid description', () => {
        const validData = {
          name: 'Team',
          description: 'This is a development team',
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with maximum length description (500 chars)', () => {
        const validData = {
          name: 'Team',
          description: 'a'.repeat(500),
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should allow missing description field', () => {
        const validData = {
          name: 'Team',
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should allow empty description', () => {
        const validData = {
          name: 'Team',
          description: '',
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should reject description exceeding 500 characters', () => {
        const invalidData = {
          name: 'Team',
          description: 'a'.repeat(501),
        };

        const result = schemas.createTeam.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('description');
        expect(result.error?.issues[0].message).toContain('less than 500');
      });
    });

    describe('color field', () => {
      it('should validate with valid hex color', () => {
        const validData = {
          name: 'Team',
          color: '#FF5733',
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with lowercase hex color', () => {
        const validData = {
          name: 'Team',
          color: '#ff5733',
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with mixed case hex color', () => {
        const validData = {
          name: 'Team',
          color: '#Ff5733',
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should allow missing color field', () => {
        const validData = {
          name: 'Team',
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should reject color without hash symbol', () => {
        const invalidData = {
          name: 'Team',
          color: 'FF5733',
        };

        const result = schemas.createTeam.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('color');
        expect(result.error?.issues[0].message).toContain('valid hex color');
      });

      it('should reject color with less than 6 hex digits', () => {
        const invalidData = {
          name: 'Team',
          color: '#FF57',
        };

        const result = schemas.createTeam.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('color');
      });

      it('should reject color with more than 6 hex digits', () => {
        const invalidData = {
          name: 'Team',
          color: '#FF573344',
        };

        const result = schemas.createTeam.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('color');
      });

      it('should reject color with invalid characters', () => {
        const invalidData = {
          name: 'Team',
          color: '#GGGGGG',
        };

        const result = schemas.createTeam.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('color');
      });
    });

    describe('icon and order fields', () => {
      it('should validate with valid icon', () => {
        const validData = {
          name: 'Team',
          icon: 'team-icon',
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with valid order', () => {
        const validData = {
          name: 'Team',
          order: 5,
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with all optional fields', () => {
        const validData = {
          name: 'Team',
          description: 'Test team',
          color: '#FF5733',
          icon: 'icon',
          order: 1,
        };

        const result = schemas.createTeam.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should reject non-integer order', () => {
        const invalidData = {
          name: 'Team',
          order: 5.5,
        };

        const result = schemas.createTeam.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('order');
      });
    });
  });

  describe('updateTeam', () => {
    it('should validate with name update', () => {
      const validData = {
        params: { id: 'team-123' },
        body: { name: 'Updated Team' },
      };

      const paramsResult = schemas.updateTeam.params.safeParse(
        validData.params,
      );
      const bodyResult = schemas.updateTeam.body.safeParse(validData.body);

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should validate with description update', () => {
      const validData = {
        body: { description: 'Updated description' },
      };

      const result = schemas.updateTeam.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should validate with color update', () => {
      const validData = {
        body: { color: '#00FF00' },
      };

      const result = schemas.updateTeam.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should validate with icon update', () => {
      const validData = {
        body: { icon: 'new-icon' },
      };

      const result = schemas.updateTeam.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should validate with multiple fields update', () => {
      const validData = {
        body: {
          name: 'New Name',
          description: 'New description',
          color: '#FF0000',
        },
      };

      const result = schemas.updateTeam.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should require team id in params', () => {
      const invalidData = {};

      const result = schemas.updateTeam.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('id');
    });

    it('should reject empty team id', () => {
      const invalidData = { id: '' };

      const result = schemas.updateTeam.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('id');
    });

    it('should reject update with no fields', () => {
      const invalidData = {};

      const result = schemas.updateTeam.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('At least one field');
    });

    it('should reject invalid color format', () => {
      const invalidData = {
        body: { color: 'invalid' },
      };

      const result = schemas.updateTeam.body.safeParse(invalidData.body);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('color');
    });

    it('should reject name that is too long', () => {
      const invalidData = {
        body: { name: 'a'.repeat(101) },
      };

      const result = schemas.updateTeam.body.safeParse(invalidData.body);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('name');
    });

    it('should reject empty name', () => {
      const invalidData = {
        body: { name: '' },
      };

      const result = schemas.updateTeam.body.safeParse(invalidData.body);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('name');
    });

    it('should reject description that is too long', () => {
      const invalidData = {
        body: { description: 'a'.repeat(501) },
      };

      const result = schemas.updateTeam.body.safeParse(invalidData.body);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('description');
    });
  });

  describe('deleteTeam', () => {
    it('should validate with valid team id', () => {
      const validData = {
        id: 'team-123',
      };

      const result = schemas.deleteTeam.params.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require team id', () => {
      const invalidData = {};

      const result = schemas.deleteTeam.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('id');
    });

    it('should reject empty team id', () => {
      const invalidData = {
        id: '',
      };

      const result = schemas.deleteTeam.params.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('getTeamAnalysisCount', () => {
    it('should validate with valid team id', () => {
      const validData = {
        id: 'team-123',
      };

      const result = schemas.getTeamAnalysisCount.params.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require team id', () => {
      const invalidData = {};

      const result = schemas.getTeamAnalysisCount.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('id');
    });
  });

  describe('moveAnalysisToTeam', () => {
    it('should validate with valid data', () => {
      const validData = {
        params: { name: 'my-analysis' },
        body: { teamId: 'team-123' },
      };

      const paramsResult = schemas.moveAnalysisToTeam.params.safeParse(
        validData.params,
      );
      const bodyResult = schemas.moveAnalysisToTeam.body.safeParse(
        validData.body,
      );

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should require analysis name in params', () => {
      const invalidData = {};

      const result = schemas.moveAnalysisToTeam.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('name');
    });

    it('should require teamId in body', () => {
      const invalidData = {};

      const result = schemas.moveAnalysisToTeam.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('teamId');
    });

    it('should reject empty analysis name', () => {
      const invalidData = { name: '' };

      const result = schemas.moveAnalysisToTeam.params.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject empty teamId', () => {
      const invalidData = { teamId: '' };

      const result = schemas.moveAnalysisToTeam.body.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('reorderTeams', () => {
    it('should validate with valid ordered ids', () => {
      const validData = {
        orderedIds: ['team-1', 'team-2', 'team-3'],
      };

      const result = schemas.reorderTeams.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with single team id', () => {
      const validData = {
        orderedIds: ['team-1'],
      };

      const result = schemas.reorderTeams.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require orderedIds field', () => {
      const invalidData = {};

      const result = schemas.reorderTeams.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('orderedIds');
    });

    it('should reject empty orderedIds array', () => {
      const invalidData = {
        orderedIds: [],
      };

      const result = schemas.reorderTeams.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('At least one');
    });

    it('should reject non-array orderedIds', () => {
      const invalidData = {
        orderedIds: 'team-1',
      };

      const result = schemas.reorderTeams.body.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject orderedIds with non-string elements', () => {
      const invalidData = {
        orderedIds: [1, 2, 3],
      };

      const result = schemas.reorderTeams.body.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('addItemToStructure', () => {
    it('should validate with analysis type', () => {
      const validData = {
        params: { teamId: 'team-123' },
        body: {
          type: 'analysis',
          id: 'item-123',
        },
      };

      const paramsResult = schemas.addItemToStructure.params.safeParse(
        validData.params,
      );
      const bodyResult = schemas.addItemToStructure.body.safeParse(
        validData.body,
      );

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should validate with folder type', () => {
      const validData = {
        body: {
          type: 'folder',
          id: 'item-123',
        },
      };

      const result = schemas.addItemToStructure.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should validate with parentId', () => {
      const validData = {
        body: {
          type: 'analysis',
          id: 'item-123',
          parentId: 'folder-123',
        },
      };

      const result = schemas.addItemToStructure.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should validate with null parentId', () => {
      const validData = {
        body: {
          type: 'analysis',
          id: 'item-123',
          parentId: null,
        },
      };

      const result = schemas.addItemToStructure.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should require type field', () => {
      const invalidData = {
        body: { id: 'item-123' },
      };

      const result = schemas.addItemToStructure.body.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('type');
    });

    it('should reject invalid type value', () => {
      const invalidData = {
        body: {
          type: 'invalid',
          id: 'item-123',
        },
      };

      const result = schemas.addItemToStructure.body.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('type');
    });

    it('should require id field', () => {
      const invalidData = {
        body: { type: 'analysis' },
      };

      const result = schemas.addItemToStructure.body.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('id');
    });

    it('should reject empty id', () => {
      const invalidData = {
        body: {
          type: 'analysis',
          id: '',
        },
      };

      const result = schemas.addItemToStructure.body.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
    });
  });

  describe('removeItemFromStructure', () => {
    it('should validate with valid params', () => {
      const validData = {
        teamId: 'team-123',
        itemId: 'item-123',
      };

      const result =
        schemas.removeItemFromStructure.params.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require teamId', () => {
      const invalidData = {
        itemId: 'item-123',
      };

      const result =
        schemas.removeItemFromStructure.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('teamId');
    });

    it('should require itemId', () => {
      const invalidData = {
        teamId: 'team-123',
      };

      const result =
        schemas.removeItemFromStructure.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('itemId');
    });
  });

  describe('createFolder', () => {
    it('should validate with valid folder data', () => {
      const validData = {
        params: { teamId: 'team-123' },
        body: { name: 'My Folder' },
      };

      const paramsResult = schemas.createFolder.params.safeParse(
        validData.params,
      );
      const bodyResult = schemas.createFolder.body.safeParse(validData.body);

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should validate with parentFolderId', () => {
      const validData = {
        body: {
          name: 'My Folder',
          parentFolderId: 'folder-123',
        },
      };

      const result = schemas.createFolder.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should validate with null parentFolderId', () => {
      const validData = {
        body: {
          name: 'My Folder',
          parentFolderId: null,
        },
      };

      const result = schemas.createFolder.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should validate with maximum length name (100 chars)', () => {
      const validData = {
        body: { name: 'a'.repeat(100) },
      };

      const result = schemas.createFolder.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should require folder name', () => {
      const invalidData = {
        body: {},
      };

      const result = schemas.createFolder.body.safeParse(invalidData.body);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('name');
    });

    it('should reject empty folder name', () => {
      const invalidData = {
        body: { name: '' },
      };

      const result = schemas.createFolder.body.safeParse(invalidData.body);

      expect(result.success).toBe(false);
    });

    it('should reject folder name exceeding 100 characters', () => {
      const invalidData = {
        body: { name: 'a'.repeat(101) },
      };

      const result = schemas.createFolder.body.safeParse(invalidData.body);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('less than 100');
    });
  });

  describe('updateFolder', () => {
    it('should validate with valid data', () => {
      const validData = {
        params: { teamId: 'team-123', folderId: 'folder-123' },
        body: { name: 'Updated Folder' },
      };

      const paramsResult = schemas.updateFolder.params.safeParse(
        validData.params,
      );
      const bodyResult = schemas.updateFolder.body.safeParse(validData.body);

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should require teamId in params', () => {
      const invalidData = {
        folderId: 'folder-123',
      };

      const result = schemas.updateFolder.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('teamId');
    });

    it('should require folderId in params', () => {
      const invalidData = {
        teamId: 'team-123',
      };

      const result = schemas.updateFolder.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('folderId');
    });

    it('should require name in body', () => {
      const invalidData = {};

      const result = schemas.updateFolder.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('name');
    });

    it('should reject empty name', () => {
      const invalidData = {
        name: '',
      };

      const result = schemas.updateFolder.body.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject name exceeding 100 characters', () => {
      const invalidData = {
        name: 'a'.repeat(101),
      };

      const result = schemas.updateFolder.body.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('deleteFolder', () => {
    it('should validate with valid params', () => {
      const validData = {
        teamId: 'team-123',
        folderId: 'folder-123',
      };

      const result = schemas.deleteFolder.params.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require teamId', () => {
      const invalidData = {
        folderId: 'folder-123',
      };

      const result = schemas.deleteFolder.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('teamId');
    });

    it('should require folderId', () => {
      const invalidData = {
        teamId: 'team-123',
      };

      const result = schemas.deleteFolder.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('folderId');
    });
  });

  describe('moveItem', () => {
    it('should validate with valid data', () => {
      const validData = {
        params: { teamId: 'team-123' },
        body: {
          itemId: 'item-123',
          newParentId: 'folder-123',
          newIndex: 5,
        },
      };

      const paramsResult = schemas.moveItem.params.safeParse(validData.params);
      const bodyResult = schemas.moveItem.body.safeParse(validData.body);

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should validate with null newParentId', () => {
      const validData = {
        body: {
          itemId: 'item-123',
          newParentId: null,
        },
      };

      const result = schemas.moveItem.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should validate with minimum newIndex (0)', () => {
      const validData = {
        body: {
          itemId: 'item-123',
          newIndex: 0,
        },
      };

      const result = schemas.moveItem.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should validate without newIndex', () => {
      const validData = {
        body: {
          itemId: 'item-123',
        },
      };

      const result = schemas.moveItem.body.safeParse(validData.body);

      expect(result.success).toBe(true);
    });

    it('should require itemId', () => {
      const invalidData = {
        body: {},
      };

      const result = schemas.moveItem.body.safeParse(invalidData.body);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('itemId');
    });

    it('should reject empty itemId', () => {
      const invalidData = {
        body: { itemId: '' },
      };

      const result = schemas.moveItem.body.safeParse(invalidData.body);

      expect(result.success).toBe(false);
    });

    it('should reject negative newIndex', () => {
      const invalidData = {
        body: {
          itemId: 'item-123',
          newIndex: -1,
        },
      };

      const result = schemas.moveItem.body.safeParse(invalidData.body);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('newIndex');
      expect(result.error?.issues[0].message).toContain('non-negative');
    });

    it('should reject non-integer newIndex', () => {
      const invalidData = {
        body: {
          itemId: 'item-123',
          newIndex: 5.5,
        },
      };

      const result = schemas.moveItem.body.safeParse(invalidData.body);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('newIndex');
    });
  });

  describe('getAllTeams schema', () => {
    describe('query validation', () => {
      it('should validate empty query object', () => {
        const validData = {};

        const result = schemas.getAllTeams.query.safeParse(validData);

        expect(result.success).toBe(true);
        expect(result.data).toEqual({});
      });

      it('should reject query with any parameters (strict mode)', () => {
        const invalidData = { someParam: 'value' };

        const result = schemas.getAllTeams.query.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject multiple unexpected parameters', () => {
        const invalidData = {
          param1: 'value1',
          param2: 'value2',
        };

        const result = schemas.getAllTeams.query.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject common filter parameters', () => {
        const invalidData = {
          includeStructure: true,
          includeAnalysisCount: false,
        };

        const result = schemas.getAllTeams.query.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject pagination parameters', () => {
        const invalidData = { page: '1', limit: '10' };

        const result = schemas.getAllTeams.query.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject search parameters', () => {
        const invalidData = { search: 'team name' };

        const result = schemas.getAllTeams.query.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });
    });
  });
});
