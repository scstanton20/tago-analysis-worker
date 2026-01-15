/**
 * Team API Types
 *
 * Request/response types for team and folder endpoints.
 */

import type { Team, TeamWithPermissions } from '../domain/team.js';
import type { TeamStructureItem } from '../domain/folder.js';
import type { TeamPermission } from '../domain/user.js';

// ============================================================================
// TEAM CRUD
// ============================================================================

/** Create team request */
export type CreateTeamRequest = {
  name: string;
  color?: string;
};

/** Create team response */
export type CreateTeamResponse = {
  team: Team;
  message: string;
};

/** Update team request */
export type UpdateTeamRequest = {
  name?: string;
  color?: string;
};

/** Update team response */
export type UpdateTeamResponse = {
  team: Team;
};

/** Delete team response */
export type DeleteTeamResponse = {
  message: string;
  teamId: string;
};

/** List teams response */
export type ListTeamsResponse = {
  teams: Array<Team>;
};

/** Get team response */
export type GetTeamResponse = {
  team: TeamWithPermissions;
};

// ============================================================================
// TEAM REORDERING
// ============================================================================

/** Reorder teams request */
export type ReorderTeamsRequest = {
  order: Array<string>;
};

/** Reorder teams response */
export type ReorderTeamsResponse = {
  message: string;
};

// ============================================================================
// FOLDER OPERATIONS
// ============================================================================

/** Create folder request */
export type CreateFolderRequest = {
  teamId: string;
  name: string;
  parentId?: string | null;
};

/** Create folder response */
export type CreateFolderResponse = {
  folder: {
    id: string;
    name: string;
    parentId?: string | null;
  };
  message: string;
};

/** Rename folder request */
export type RenameFolderRequest = {
  name: string;
};

/** Rename folder response */
export type RenameFolderResponse = {
  message: string;
  folderId: string;
  name: string;
};

/** Delete folder response */
export type DeleteFolderResponse = {
  message: string;
  folderId: string;
  childrenMoved: number;
};

/** Get team structure response */
export type GetTeamStructureResponse = {
  teamId: string;
  items: Array<TeamStructureItem>;
  version?: number;
};

/** Update team structure request */
export type UpdateTeamStructureRequest = {
  items: Array<TeamStructureItem>;
};

/** Update team structure response */
export type UpdateTeamStructureResponse = {
  message: string;
  version: number;
};

// ============================================================================
// TEAM MEMBERS
// ============================================================================

/** Add team member request */
export type AddTeamMemberRequest = {
  userId: string;
  permissions: Array<TeamPermission>;
};

/** Add team member response */
export type AddTeamMemberResponse = {
  message: string;
  userId: string;
  teamId: string;
};

/** Update team member request */
export type UpdateTeamMemberRequest = {
  permissions: Array<TeamPermission>;
};

/** Update team member response */
export type UpdateTeamMemberResponse = {
  message: string;
  userId: string;
  permissions: Array<TeamPermission>;
};

/** Remove team member response */
export type RemoveTeamMemberResponse = {
  message: string;
  userId: string;
  teamId: string;
};

/** List team members response */
export type ListTeamMembersResponse = {
  members: Array<{
    userId: string;
    name: string;
    email: string;
    permissions: Array<TeamPermission>;
  }>;
};

// ============================================================================
// ANALYSIS MOVEMENT WITHIN TEAMS
// ============================================================================

/** Move analysis to team request */
export type MoveAnalysisToTeamRequest = {
  teamId: string | null;
};

/** Move analysis to team response */
export type MoveAnalysisToTeamResponse = {
  success: boolean;
  message: string;
  analysisId: string;
  fromTeamId: string | null;
  toTeamId: string | null;
};

/** Update folder request (with collapse support) */
export type UpdateFolderRequest = {
  name?: string;
  collapsed?: boolean;
};

/** Move item within team structure request */
export type MoveItemRequest = {
  itemId: string;
  /** Target parent folder ID (null for root level) */
  targetParentId: string | null;
  /** Index position in target location */
  targetIndex: number;
};

/** Move item response */
export type MoveItemResponse = {
  success: boolean;
  message: string;
};

/** Team analysis count response */
export type TeamAnalysisCountResponse = {
  count: number;
};

/** Delete team result (with analysis handling) */
export type DeleteTeamResult = {
  success: boolean;
  message: string;
  deletedTeamId: string;
  movedAnalysesCount: number;
};

/** Delete folder result */
export type DeleteFolderResult = {
  success: boolean;
  message: string;
  deletedFolderId: string;
  childrenMoved: number;
};
