import { describe, it, expect } from 'vitest';
import { userValidationSchemas as schemas } from '../../src/validation/userSchemas.ts';

describe('userSchemas', () => {
  describe('addToOrganization', () => {
    it('should validate with all required fields', () => {
      const validData = {
        userId: 'user-123',
        organizationId: 'org-456',
      };

      const result = schemas.addToOrganization.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with explicit role', () => {
      const validData = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'admin',
      };

      const result = schemas.addToOrganization.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should default role to member when not provided', () => {
      const validData = {
        userId: 'user-123',
        organizationId: 'org-456',
      };

      const result = schemas.addToOrganization.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data?.role).toBe('member');
    });

    it('should validate with owner role', () => {
      const validData = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'owner',
      };

      const result = schemas.addToOrganization.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with member role', () => {
      const validData = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'member',
      };

      const result = schemas.addToOrganization.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require userId field', () => {
      const invalidData = {
        organizationId: 'org-456',
      };

      const result = schemas.addToOrganization.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should reject empty userId', () => {
      const invalidData = {
        userId: '',
        organizationId: 'org-456',
      };

      const result = schemas.addToOrganization.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should require organizationId field', () => {
      const invalidData = {
        userId: 'user-123',
      };

      const result = schemas.addToOrganization.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('organizationId');
    });

    it('should reject empty organizationId', () => {
      const invalidData = {
        userId: 'user-123',
        organizationId: '',
      };

      const result = schemas.addToOrganization.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('organizationId');
    });

    it('should reject invalid role value', () => {
      const invalidData = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'superuser',
      };

      const result = schemas.addToOrganization.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('role');
    });
  });

  describe('assignUserToTeams', () => {
    it('should validate with valid team assignments', () => {
      const validData = {
        userId: 'user-123',
        teamAssignments: [
          { teamId: 'team-1', permissions: ['read', 'write'] },
          { teamId: 'team-2', permissions: ['read'] },
        ],
      };

      const result = schemas.assignUserToTeams.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with empty permissions array', () => {
      const validData = {
        userId: 'user-123',
        teamAssignments: [{ teamId: 'team-1', permissions: [] }],
      };

      const result = schemas.assignUserToTeams.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should default permissions to empty array when not provided', () => {
      const validData = {
        userId: 'user-123',
        teamAssignments: [{ teamId: 'team-1' }],
      };

      const result = schemas.assignUserToTeams.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data?.teamAssignments[0].permissions).toEqual([]);
    });

    it('should default teamAssignments to empty array when not provided', () => {
      const validData = {
        userId: 'user-123',
      };

      const result = schemas.assignUserToTeams.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data?.teamAssignments).toEqual([]);
    });

    it('should validate with empty teamAssignments array', () => {
      const validData = {
        userId: 'user-123',
        teamAssignments: [],
      };

      const result = schemas.assignUserToTeams.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require userId field', () => {
      const invalidData = {
        teamAssignments: [{ teamId: 'team-1' }],
      };

      const result = schemas.assignUserToTeams.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should reject empty userId', () => {
      const invalidData = {
        userId: '',
        teamAssignments: [{ teamId: 'team-1' }],
      };

      const result = schemas.assignUserToTeams.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should reject team assignment without teamId', () => {
      const invalidData = {
        userId: 'user-123',
        teamAssignments: [{ permissions: ['read'] }],
      };

      const result = schemas.assignUserToTeams.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('teamId');
    });

    it('should reject team assignment with empty teamId', () => {
      const invalidData = {
        userId: 'user-123',
        teamAssignments: [{ teamId: '', permissions: ['read'] }],
      };

      const result = schemas.assignUserToTeams.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('teamId');
    });

    it('should reject non-array teamAssignments', () => {
      const invalidData = {
        userId: 'user-123',
        teamAssignments: 'not-an-array',
      };

      const result = schemas.assignUserToTeams.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject non-array permissions', () => {
      const invalidData = {
        userId: 'user-123',
        teamAssignments: [{ teamId: 'team-1', permissions: 'read' }],
      };

      const result = schemas.assignUserToTeams.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject non-string permissions values', () => {
      const invalidData = {
        userId: 'user-123',
        teamAssignments: [{ teamId: 'team-1', permissions: [123, 456] }],
      };

      const result = schemas.assignUserToTeams.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('updateUserTeamAssignments', () => {
    it('should validate with valid data', () => {
      const validData = {
        params: { userId: 'user-123' },
        body: {
          teamAssignments: [{ teamId: 'team-1', permissions: ['read'] }],
        },
      };

      const paramsResult = schemas.updateUserTeamAssignments.params!.safeParse(
        validData.params,
      );
      const bodyResult = schemas.updateUserTeamAssignments.body!.safeParse(
        validData.body,
      );

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should validate with empty teamAssignments', () => {
      const validData = {
        body: {
          teamAssignments: [],
        },
      };

      const result = schemas.updateUserTeamAssignments.body!.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
    });

    it('should default teamAssignments to empty array when not provided', () => {
      const validData = {
        body: {},
      };

      const result = schemas.updateUserTeamAssignments.body!.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
      expect(result.data?.teamAssignments).toEqual([]);
    });

    it('should require userId in params', () => {
      const invalidData = {};

      const result =
        schemas.updateUserTeamAssignments.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should reject empty userId in params', () => {
      const invalidData = {
        userId: '',
      };

      const result =
        schemas.updateUserTeamAssignments.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject invalid team assignment structure', () => {
      const invalidData = {
        body: {
          teamAssignments: [{ invalidField: 'value' }],
        },
      };

      const result = schemas.updateUserTeamAssignments.body!.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
    });
  });

  describe('updateUserOrganizationRole', () => {
    it('should validate with admin role', () => {
      const validData = {
        params: { userId: 'user-123' },
        body: {
          organizationId: 'org-456',
          role: 'admin',
        },
      };

      const paramsResult = schemas.updateUserOrganizationRole.params!.safeParse(
        validData.params,
      );
      const bodyResult = schemas.updateUserOrganizationRole.body!.safeParse(
        validData.body,
      );

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should validate with owner role', () => {
      const validData = {
        body: {
          organizationId: 'org-456',
          role: 'owner',
        },
      };

      const result = schemas.updateUserOrganizationRole.body!.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
    });

    it('should validate with member role', () => {
      const validData = {
        body: {
          organizationId: 'org-456',
          role: 'member',
        },
      };

      const result = schemas.updateUserOrganizationRole.body!.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
    });

    it('should require userId in params', () => {
      const invalidData = {};

      const result =
        schemas.updateUserOrganizationRole.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should allow null organizationId in body', () => {
      const validData = {
        body: {
          organizationId: null,
          role: 'admin',
        },
      };

      const result = schemas.updateUserOrganizationRole.body!.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
    });

    it('should allow undefined organizationId in body', () => {
      const validData = {
        body: {
          role: 'admin',
        },
      };

      const result = schemas.updateUserOrganizationRole.body!.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
    });

    it('should require role in body', () => {
      const invalidData = {
        body: {
          organizationId: 'org-456',
        },
      };

      const result = schemas.updateUserOrganizationRole.body!.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('role');
    });

    it('should reject empty organizationId', () => {
      const invalidData = {
        body: {
          organizationId: '',
          role: 'admin',
        },
      };

      const result = schemas.updateUserOrganizationRole.body!.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('organizationId');
    });

    it('should validate with teamAssignments', () => {
      const validData = {
        body: {
          organizationId: 'org-456',
          role: 'member',
          teamAssignments: [
            { teamId: 'team-1', permissions: ['analysis.view'] },
          ],
        },
      };

      const result = schemas.updateUserOrganizationRole.body!.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
    });

    it('should validate with null organizationId and teamAssignments', () => {
      const validData = {
        body: {
          organizationId: null,
          role: 'member',
          teamAssignments: [
            { teamId: 'team-1', permissions: ['analysis.view'] },
          ],
        },
      };

      const result = schemas.updateUserOrganizationRole.body!.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
    });

    it('should reject invalid role value', () => {
      const invalidData = {
        body: {
          organizationId: 'org-456',
          role: 'superadmin',
        },
      };

      const result = schemas.updateUserOrganizationRole.body!.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('role');
    });
  });

  describe('removeUserFromOrganization', () => {
    it('should validate with valid data', () => {
      const validData = {
        params: { userId: 'user-123' },
        body: { organizationId: 'org-456' },
      };

      const paramsResult = schemas.removeUserFromOrganization.params!.safeParse(
        validData.params,
      );
      const bodyResult = schemas.removeUserFromOrganization.body!.safeParse(
        validData.body,
      );

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should validate with null organizationId for orphaned users', () => {
      const validData = {
        body: { organizationId: null },
      };

      const result = schemas.removeUserFromOrganization.body!.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
    });

    it('should require userId in params', () => {
      const invalidData = {};

      const result =
        schemas.removeUserFromOrganization.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should reject empty userId in params', () => {
      const invalidData = {
        userId: '',
      };

      const result =
        schemas.removeUserFromOrganization.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should require organizationId in body', () => {
      const invalidData = {
        body: {},
      };

      const result = schemas.removeUserFromOrganization.body!.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('organizationId');
    });

    it('should reject empty organizationId when not null', () => {
      const invalidData = {
        body: { organizationId: '' },
      };

      const result = schemas.removeUserFromOrganization.body!.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('organizationId');
    });
  });
});
