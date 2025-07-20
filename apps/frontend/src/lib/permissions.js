import { createAccessControl } from 'better-auth/plugins/access';
import {
  defaultStatements,
  adminAc,
} from 'better-auth/plugins/organization/access';

/**
 * Define custom permissions for analysis operations (frontend)
 * This should match the backend permissions configuration
 */
const statement = {
  ...defaultStatements, // Include default organization permissions
  analysis: ['view', 'run', 'upload', 'download', 'edit', 'delete'],
};

const ac = createAccessControl(statement);

// Define roles with specific permissions (matching backend)
const member = ac.newRole({
  analysis: ['view', 'run'], // Basic team members can view and run analyses
});

const contributor = ac.newRole({
  analysis: ['view', 'run', 'upload', 'download'], // Contributors can also upload and download
});

const teamLeader = ac.newRole({
  analysis: ['view', 'run', 'upload', 'download', 'edit'], // Team leaders can edit configurations
});

const admin = ac.newRole({
  analysis: ['view', 'run', 'upload', 'download', 'edit', 'delete'], // Admins have all permissions
  ...adminAc.statements, // Include default admin permissions
});

const owner = ac.newRole({
  analysis: ['view', 'run', 'upload', 'download', 'edit', 'delete'], // Owners have all permissions
  ...adminAc.statements, // Include default owner permissions
});

export { ac, member, contributor, teamLeader, admin, owner };
