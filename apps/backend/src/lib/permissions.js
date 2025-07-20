import { createAccessControl } from 'better-auth/plugins/access';
import {
  defaultStatements,
  adminAc,
} from 'better-auth/plugins/organization/access';

/**
 * Define custom permissions for analysis operations
 * Using standardized format: permission_analyses
 */
const statement = {
  ...defaultStatements, // Include default organization permissions
  analysis: [
    'view_analyses',
    'run_analyses',
    'upload_analyses',
    'download_analyses',
    'edit_analyses',
    'delete_analyses',
  ],
};

const ac = createAccessControl(statement);

// Define roles with specific permissions
const member = ac.newRole({
  analysis: ['view_analyses', 'run_analyses'], // Basic team members can view and run analyses
});

const contributor = ac.newRole({
  analysis: [
    'view_analyses',
    'run_analyses',
    'upload_analyses',
    'download_analyses',
  ], // Contributors can also upload and download
});

const teamLeader = ac.newRole({
  analysis: [
    'view_analyses',
    'run_analyses',
    'upload_analyses',
    'download_analyses',
    'edit_analyses',
  ], // Team leaders can edit configurations
});

const admin = ac.newRole({
  analysis: [
    'view_analyses',
    'run_analyses',
    'upload_analyses',
    'download_analyses',
    'edit_analyses',
    'delete_analyses',
  ], // Admins have all permissions
  ...adminAc.statements, // Include default admin permissions
});

const owner = ac.newRole({
  analysis: [
    'view_analyses',
    'run_analyses',
    'upload_analyses',
    'download_analyses',
    'edit_analyses',
    'delete_analyses',
  ], // Owners have all permissions
  ...adminAc.statements, // Include default owner permissions
});

export { ac, member, contributor, teamLeader, admin, owner };
