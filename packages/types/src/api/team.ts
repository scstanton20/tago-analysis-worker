/**
 * Team API Types
 *
 * Request/response types for team and folder endpoints.
 */

import type { Team, TeamWithPermissions } from '../domain/team.js';
import type { TeamStructure, TeamStructureItem } from '../domain/folder.js';
import type { TeamPermission } from '../domain/user.js';

// ============================================================================
// TEAM CRUD
// ============================================================================

/** Create team request */
export interface CreateTeamRequest {
  name: string;
  color?: string;
}

/** Create team response */
export interface CreateTeamResponse {
  team: Team;
  message: string;
}

/** Update team request */
export interface UpdateTeamRequest {
  name?: string;
  color?: string;
}

/** Update team response */
export interface UpdateTeamResponse {
  team: Team;
}

/** Delete team response */
export interface DeleteTeamResponse {
  message: string;
  teamId: string;
}

/** List teams response */
export interface ListTeamsResponse {
  teams: Team[];
}

/** Get team response */
export interface GetTeamResponse {
  team: TeamWithPermissions;
}

// ============================================================================
// TEAM REORDERING
// ============================================================================

/** Reorder teams request */
export interface ReorderTeamsRequest {
  order: string[];
}

/** Reorder teams response */
export interface ReorderTeamsResponse {
  message: string;
}

// ============================================================================
// FOLDER OPERATIONS
// ============================================================================

/** Create folder request */
export interface CreateFolderRequest {
  teamId: string;
  name: string;
  parentId?: string | null;
}

/** Create folder response */
export interface CreateFolderResponse {
  folder: {
    id: string;
    name: string;
    parentId?: string | null;
  };
  message: string;
}

/** Rename folder request */
export interface RenameFolderRequest {
  name: string;
}

/** Rename folder response */
export interface RenameFolderResponse {
  message: string;
  folderId: string;
  name: string;
}

/** Delete folder response */
export interface DeleteFolderResponse {
  message: string;
  folderId: string;
  childrenMoved: number;
}

/** Get team structure response */
export interface GetTeamStructureResponse {
  teamId: string;
  items: TeamStructureItem[];
  version?: number;
}

/** Update team structure request */
export interface UpdateTeamStructureRequest {
  items: TeamStructureItem[];
}

/** Update team structure response */
export interface UpdateTeamStructureResponse {
  message: string;
  version: number;
}

// ============================================================================
// TEAM MEMBERS
// ============================================================================

/** Add team member request */
export interface AddTeamMemberRequest {
  userId: string;
  permissions: TeamPermission[];
}

/** Add team member response */
export interface AddTeamMemberResponse {
  message: string;
  userId: string;
  teamId: string;
}

/** Update team member request */
export interface UpdateTeamMemberRequest {
  permissions: TeamPermission[];
}

/** Update team member response */
export interface UpdateTeamMemberResponse {
  message: string;
  userId: string;
  permissions: TeamPermission[];
}

/** Remove team member response */
export interface RemoveTeamMemberResponse {
  message: string;
  userId: string;
  teamId: string;
}

/** List team members response */
export interface ListTeamMembersResponse {
  members: Array<{
    userId: string;
    name: string;
    email: string;
    permissions: TeamPermission[];
  }>;
}

// ============================================================================
// ANALYSIS MOVEMENT WITHIN TEAMS
// ============================================================================

/** Move analysis to team request */
export interface MoveAnalysisToTeamRequest {
  teamId: string | null;
}

/** Move analysis to team response */
export interface MoveAnalysisToTeamResponse {
  success: boolean;
  message: string;
  analysisId: string;
  fromTeamId: string | null;
  toTeamId: string | null;
}

/** Update folder request (with collapse support) */
export interface UpdateFolderRequest {
  name?: string;
  collapsed?: boolean;
}

/** Move item within team structure request */
export interface MoveItemRequest {
  itemId: string;
  newParentId: string | null;
  newIndex: number;
}

/** Move item response */
export interface MoveItemResponse {
  success: boolean;
  message: string;
}

/** Team analysis count response */
export interface TeamAnalysisCountResponse {
  count: number;
}

/** Delete team result (with analysis handling) */
export interface DeleteTeamResult {
  success: boolean;
  message: string;
  deletedTeamId: string;
  movedAnalysesCount: number;
}

/** Delete folder result */
export interface DeleteFolderResult {
  success: boolean;
  message: string;
  deletedFolderId: string;
  childrenMoved: number;
}
