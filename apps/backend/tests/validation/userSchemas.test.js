import { describe, it, expect, beforeEach } from 'vitest';

describe('userSchemas', () => {
  let schemas;

  beforeEach(async () => {
    const module = await import('../../src/validation/userSchemas.js');
    schemas = module.userValidationSchemas;
  });

  describe('addToOrganization', () => {
    it('should validate with all required fields', () => {
      const validData = {
        userId: 'user-123',
        organizationId: 'org-456',
      };

      const result = schemas.addToOrganization.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with explicit role', () => {
      const validData = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'admin',
      };

      const result = schemas.addToOrganization.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should default role to member when not provided', () => {
      const validData = {
        userId: 'user-123',
        organizationId: 'org-456',
      };

      const result = schemas.addToOrganization.body.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data?.role).toBe('member');
    });

    it('should validate with owner role', () => {
      const validData = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'owner',
      };

      const result = schemas.addToOrganization.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with member role', () => {
      const validData = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'member',
      };

      const result = schemas.addToOrganization.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require userId field', () => {
      const invalidData = {
        organizationId: 'org-456',
      };

      const result = schemas.addToOrganization.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should reject empty userId', () => {
      const invalidData = {
        userId: '',
        organizationId: 'org-456',
      };

      const result = schemas.addToOrganization.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should require organizationId field', () => {
      const invalidData = {
        userId: 'user-123',
      };

      const result = schemas.addToOrganization.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('organizationId');
    });

    it('should reject empty organizationId', () => {
      const invalidData = {
        userId: 'user-123',
        organizationId: '',
      };

      const result = schemas.addToOrganization.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('organizationId');
    });

    it('should reject invalid role value', () => {
      const invalidData = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'superuser',
      };

      const result = schemas.addToOrganization.body.safeParse(invalidData);

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

      const result = schemas.assignUserToTeams.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with empty permissions array', () => {
      const validData = {
        userId: 'user-123',
        teamAssignments: [{ teamId: 'team-1', permissions: [] }],
      };

      const result = schemas.assignUserToTeams.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should default permissions to empty array when not provided', () => {
      const validData = {
        userId: 'user-123',
        teamAssignments: [{ teamId: 'team-1' }],
      };

      const result = schemas.assignUserToTeams.body.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data?.teamAssignments[0].permissions).toEqual([]);
    });

    it('should default teamAssignments to empty array when not provided', () => {
      const validData = {
        userId: 'user-123',
      };

      const result = schemas.assignUserToTeams.body.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data?.teamAssignments).toEqual([]);
    });

    it('should validate with empty teamAssignments array', () => {
      const validData = {
        userId: 'user-123',
        teamAssignments: [],
      };

      const result = schemas.assignUserToTeams.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require userId field', () => {
      const invalidData = {
        teamAssignments: [{ teamId: 'team-1' }],
      };

      const result = schemas.assignUserToTeams.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should reject empty userId', () => {
      const invalidData = {
        userId: '',
        teamAssignments: [{ teamId: 'team-1' }],
      };

      const result = schemas.assignUserToTeams.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should reject team assignment without teamId', () => {
      const invalidData = {
        userId: 'user-123',
        teamAssignments: [{ permissions: ['read'] }],
      };

      const result = schemas.assignUserToTeams.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('teamId');
    });

    it('should reject team assignment with empty teamId', () => {
      const invalidData = {
        userId: 'user-123',
        teamAssignments: [{ teamId: '', permissions: ['read'] }],
      };

      const result = schemas.assignUserToTeams.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('teamId');
    });

    it('should reject non-array teamAssignments', () => {
      const invalidData = {
        userId: 'user-123',
        teamAssignments: 'not-an-array',
      };

      const result = schemas.assignUserToTeams.body.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject non-array permissions', () => {
      const invalidData = {
        userId: 'user-123',
        teamAssignments: [{ teamId: 'team-1', permissions: 'read' }],
      };

      const result = schemas.assignUserToTeams.body.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject non-string permissions values', () => {
      const invalidData = {
        userId: 'user-123',
        teamAssignments: [{ teamId: 'team-1', permissions: [123, 456] }],
      };

      const result = schemas.assignUserToTeams.body.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('getUserTeamMemberships', () => {
    it('should validate with valid userId', () => {
      const validData = {
        userId: 'user-123',
      };

      const result = schemas.getUserTeamMemberships.params.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require userId field', () => {
      const invalidData = {};

      const result =
        schemas.getUserTeamMemberships.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should reject empty userId', () => {
      const invalidData = {
        userId: '',
      };

      const result =
        schemas.getUserTeamMemberships.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should reject non-string userId', () => {
      const invalidData = {
        userId: 123,
      };

      const result =
        schemas.getUserTeamMemberships.params.safeParse(invalidData);

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

      const paramsResult = schemas.updateUserTeamAssignments.params.safeParse(
        validData.params,
      );
      const bodyResult = schemas.updateUserTeamAssignments.body.safeParse(
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

      const result = schemas.updateUserTeamAssignments.body.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
    });

    it('should default teamAssignments to empty array when not provided', () => {
      const validData = {
        body: {},
      };

      const result = schemas.updateUserTeamAssignments.body.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
      expect(result.data?.teamAssignments).toEqual([]);
    });

    it('should require userId in params', () => {
      const invalidData = {};

      const result =
        schemas.updateUserTeamAssignments.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should reject empty userId in params', () => {
      const invalidData = {
        userId: '',
      };

      const result =
        schemas.updateUserTeamAssignments.params.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject invalid team assignment structure', () => {
      const invalidData = {
        body: {
          teamAssignments: [{ invalidField: 'value' }],
        },
      };

      const result = schemas.updateUserTeamAssignments.body.safeParse(
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

      const paramsResult = schemas.updateUserOrganizationRole.params.safeParse(
        validData.params,
      );
      const bodyResult = schemas.updateUserOrganizationRole.body.safeParse(
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

      const result = schemas.updateUserOrganizationRole.body.safeParse(
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

      const result = schemas.updateUserOrganizationRole.body.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
    });

    it('should require userId in params', () => {
      const invalidData = {};

      const result =
        schemas.updateUserOrganizationRole.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should require organizationId in body', () => {
      const invalidData = {
        body: {
          role: 'admin',
        },
      };

      const result = schemas.updateUserOrganizationRole.body.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('organizationId');
    });

    it('should require role in body', () => {
      const invalidData = {
        body: {
          organizationId: 'org-456',
        },
      };

      const result = schemas.updateUserOrganizationRole.body.safeParse(
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

      const result = schemas.updateUserOrganizationRole.body.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('organizationId');
    });

    it('should reject invalid role value', () => {
      const invalidData = {
        body: {
          organizationId: 'org-456',
          role: 'superadmin',
        },
      };

      const result = schemas.updateUserOrganizationRole.body.safeParse(
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

      const paramsResult = schemas.removeUserFromOrganization.params.safeParse(
        validData.params,
      );
      const bodyResult = schemas.removeUserFromOrganization.body.safeParse(
        validData.body,
      );

      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('should validate with null organizationId for orphaned users', () => {
      const validData = {
        body: { organizationId: null },
      };

      const result = schemas.removeUserFromOrganization.body.safeParse(
        validData.body,
      );

      expect(result.success).toBe(true);
    });

    it('should require userId in params', () => {
      const invalidData = {};

      const result =
        schemas.removeUserFromOrganization.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('userId');
    });

    it('should reject empty userId in params', () => {
      const invalidData = {
        userId: '',
      };

      const result =
        schemas.removeUserFromOrganization.params.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should require organizationId in body', () => {
      const invalidData = {
        body: {},
      };

      const result = schemas.removeUserFromOrganization.body.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('organizationId');
    });

    it('should reject empty organizationId when not null', () => {
      const invalidData = {
        body: { organizationId: '' },
      };

      const result = schemas.removeUserFromOrganization.body.safeParse(
        invalidData.body,
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('organizationId');
    });
  });

  describe('setInitialPassword', () => {
    it('should validate with valid password containing uppercase', () => {
      const validData = {
        newPassword: 'Secure123',
      };

      const result = schemas.setInitialPassword.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with minimum length password with uppercase', () => {
      const validData = {
        newPassword: 'Pass12',
      };

      const result = schemas.setInitialPassword.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with long password containing uppercase', () => {
      const validData = {
        newPassword: 'A' + 'a'.repeat(99),
      };

      const result = schemas.setInitialPassword.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with special characters and uppercase in password', () => {
      const validData = {
        newPassword: 'P@ssw0rd!',
      };

      const result = schemas.setInitialPassword.body.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require newPassword field', () => {
      const invalidData = {};

      const result = schemas.setInitialPassword.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('newPassword');
    });

    it('should reject password shorter than 6 characters', () => {
      const invalidData = {
        newPassword: 'Pass1',
      };

      const result = schemas.setInitialPassword.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('newPassword');
      expect(result.error?.issues[0].message).toContain(
        'at least 6 characters',
      );
    });

    it('should reject password without uppercase letter', () => {
      const invalidData = {
        newPassword: 'secure123',
      };

      const result = schemas.setInitialPassword.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('newPassword');
      expect(result.error?.issues[0].message).toContain(
        'at least one uppercase letter',
      );
    });

    it('should reject all lowercase password even if long enough', () => {
      const invalidData = {
        newPassword: 'abcdef123456',
      };

      const result = schemas.setInitialPassword.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('newPassword');
      expect(result.error?.issues[0].message).toContain(
        'at least one uppercase letter',
      );
    });

    it('should reject empty password', () => {
      const invalidData = {
        newPassword: '',
      };

      const result = schemas.setInitialPassword.body.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('newPassword');
    });

    it('should reject non-string password', () => {
      const invalidData = {
        newPassword: 123456,
      };

      const result = schemas.setInitialPassword.body.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });
});
