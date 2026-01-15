/**
 * Team Service - Manages teams via Better Auth organization plugin,
 * hierarchical folder structures, and analysis-team assignments.
 *
 * Features:
 * - Team CRUD with Better Auth integration (custom fields: color, order_index, is_system)
 * - Hierarchical folder structure with drag-and-drop support
 * - Analysis-team assignment with automatic migration on team deletion
 * - Singleton pattern with request-scoped logging
 */
import type { Logger } from 'pino';
import type {
  Team,
  TeamStructure,
  TeamStructureItem,
  FolderStructureItem,
} from '@tago-analysis-worker/types';
import {
  executeQuery,
  executeQueryAll,
  executeTransaction,
} from '../utils/authDatabase.ts';
import { generateId } from '../utils/generateId.ts';
import { createChildLogger } from '../utils/logging/logger.ts';
import {
  convertSQLiteBooleans,
  convertSQLiteBooleansArray,
} from '../utils/databaseHelpers.ts';
import { getAuth } from '../utils/lazyLoader.ts';

// Module-level logger for initialization; public methods accept logger parameter for request-scoped logging
const moduleLogger = createChildLogger('team-service');

/** Internal type for team data from better-auth API */
type BetterAuthTeamData = {
  id: string;
  name: string;
  organizationId: string;
  createdAt: Date | string;
  color?: string;
  order_index?: number;
  is_system?: boolean | number;
};

/** Team data as stored in SQLite (with snake_case and numeric booleans) */
type TeamRow = {
  id: string;
  name: string;
  organizationId: string;
  createdAt: string;
  color: string;
  orderIndex: number;
  isSystem: number | boolean;
};

/** Team creation input */
type CreateTeamInput = {
  name: string;
  color?: string;
  order?: number;
  isSystem?: boolean;
};

/** Team update input */
type TeamUpdateInput = {
  name?: string;
  color?: string;
  order?: number;
};

/** Analysis service type (for lazy loading) */
type AnalysisServiceInterface = {
  getConfig(): Promise<ConfigData>;
  updateConfig(config: ConfigData): Promise<void>;
};

/** Config data structure */
type ConfigData = {
  analyses?: Record<string, AnalysisConfig>;
  teamStructure?: Record<string, TeamStructure>;
};

/** Analysis config in the config file */
type AnalysisConfig = {
  name: string;
  teamId?: string | null;
  lastModified?: string;
  [key: string]: unknown;
};

/** New item to add to team structure */
export type NewStructureItem = {
  id: string;
  type: 'analysis' | 'folder';
  name?: string;
  items?: TeamStructureItem[];
};

/** Folder update input */
type FolderUpdateInput = {
  name?: string;
  expanded?: boolean;
};

/** Result of finding an item with its parent */
type FindItemResult = {
  parent: FolderStructureItem | null;
  item: TeamStructureItem | null;
  index: number;
};

/** Move analysis result */
type MoveAnalysisResult = {
  analysisId: string;
  analysisName: string;
  from: string | null | undefined;
  to: string;
};

/** Delete team result */
type DeleteTeamResult = {
  deleted: string;
  name: string;
};

/** Delete folder result */
type DeleteFolderResult = {
  deleted: string;
  childrenMoved: number;
};

/** Move item result */
type MoveItemResult = {
  moved: string;
  to: string;
};

// SQL query constants to avoid duplication
const TEAM_SELECT_FIELDS = `
  id,
  name,
  organizationId,
  createdAt,
  color,
  order_index AS orderIndex,
  is_system AS isSystem`;

const TEAM_ORDER_BY = 'isSystem DESC, orderIndex, name';

class TeamService {
  private analysisService: AnalysisServiceInterface | null;
  private initialized: boolean;
  private organizationId: string | null;

  constructor() {
    this.analysisService = null;
    this.initialized = false;
    this.organizationId = null;
  }

  async initialize(analysisService: AnalysisServiceInterface): Promise<void> {
    if (this.initialized) return;

    this.analysisService = analysisService;

    try {
      await this.loadOrganizationId();

      this.initialized = true;
      moduleLogger.info(
        { organizationId: this.organizationId },
        'Team service initialized (using better-auth teams)',
      );
    } catch (error) {
      moduleLogger.error({ error }, 'Failed to initialize team service');
      throw error;
    }
  }

  async loadOrganizationId(): Promise<void> {
    try {
      const org = executeQuery<{ id: string }>(
        'SELECT id FROM organization WHERE slug = ?',
        ['main'],
        'loading organization ID',
      );

      if (!org) {
        throw new Error('Main organization not found in better-auth database');
      }

      this.organizationId = org.id;
      moduleLogger.info(
        { organizationId: this.organizationId },
        'Loaded organization ID',
      );
    } catch (error) {
      moduleLogger.error({ error }, 'Failed to load organization ID');
      throw error;
    }
  }

  async getAllTeams(logger: Logger = moduleLogger): Promise<Team[]> {
    try {
      logger.info({ action: 'getAllTeams' }, 'Getting all teams');

      const teams = executeQueryAll<TeamRow>(
        `SELECT ${TEAM_SELECT_FIELDS}
        FROM team
        WHERE organizationId = ?
        ORDER BY ${TEAM_ORDER_BY}`,
        [this.organizationId],
        'getting all teams',
      );

      const result = convertSQLiteBooleansArray(
        teams as unknown as Record<string, unknown>[],
        ['isSystem'],
      ) as unknown as Team[];

      logger.info(
        { action: 'getAllTeams', teamCount: result.length },
        'Teams retrieved',
      );
      return result;
    } catch (error) {
      logger.error(
        { action: 'getAllTeams', err: error },
        'Failed to get teams',
      );
      throw error;
    }
  }

  async getTeam(
    id: string,
    logger: Logger = moduleLogger,
  ): Promise<Team | undefined> {
    try {
      logger.info({ action: 'getTeam', teamId: id }, 'Getting team');

      let team = executeQuery<TeamRow>(
        `SELECT ${TEAM_SELECT_FIELDS}
        FROM team
        WHERE id = ? AND organizationId = ?`,
        [id, this.organizationId],
        `getting team ${id}`,
      );

      if (team) {
        team = convertSQLiteBooleans(
          team as unknown as Record<string, unknown>,
          ['isSystem'],
        ) as unknown as TeamRow;
        logger.info(
          { action: 'getTeam', teamId: id, teamName: team.name },
          'Team retrieved',
        );
      } else {
        logger.info({ action: 'getTeam', teamId: id }, 'Team not found');
      }

      return team as Team | undefined;
    } catch (error) {
      logger.error(
        { action: 'getTeam', err: error, teamId: id },
        'Failed to get team',
      );
      throw error;
    }
  }

  async createTeam(
    data: CreateTeamInput,
    headers: Record<string, string> = {},
    logger: Logger = moduleLogger,
  ): Promise<Team> {
    try {
      logger.info(
        { action: 'createTeam', teamName: data.name },
        'Creating team',
      );

      const existing = executeQuery<{ id: string }>(
        'SELECT id FROM team WHERE name = ? AND organizationId = ?',
        [data.name, this.organizationId],
        `checking if team "${data.name}" exists`,
      );

      if (existing) {
        throw new Error(`Team with name "${data.name}" already exists`);
      }

      // Get auth via lazy loader to avoid circular dependencies
      const auth = await getAuth();

      const teamResult = (await auth.api.createTeam({
        body: {
          name: data.name,
          organizationId: this.organizationId!,
          color: data.color || '#3B82F6',
          order_index: data.order || 0,
          is_system: data.isSystem || false,
        },
        headers,
      })) as unknown as BetterAuthTeamData | { error?: { message: string } };

      if ('error' in teamResult && teamResult.error) {
        throw new Error(`Failed to create team: ${teamResult.error.message}`);
      }

      const teamData = teamResult as BetterAuthTeamData;

      const createdAt =
        teamData.createdAt instanceof Date
          ? teamData.createdAt.toISOString()
          : teamData.createdAt;

      const team = convertSQLiteBooleans(
        {
          id: teamData.id,
          name: teamData.name,
          organizationId: teamData.organizationId,
          createdAt,
          color: teamData.color || '#3B82F6',
          orderIndex: teamData.order_index || 0,
          isSystem: teamData.is_system || false,
        } as Record<string, unknown>,
        ['isSystem'],
      ) as unknown as Team;

      logger.info(
        { action: 'createTeam', teamId: team.id, teamName: team.name },
        'Created team via better-auth API with additional fields',
      );
      return team;
    } catch (error) {
      logger.error(
        { action: 'createTeam', err: error, teamName: data.name },
        'Failed to create team',
      );
      throw error;
    }
  }

  async updateTeam(
    id: string,
    updates: TeamUpdateInput,
    logger: Logger = moduleLogger,
  ): Promise<Team | null> {
    try {
      logger.info(
        { action: 'updateTeam', teamId: id, updates },
        'Updating team',
      );

      // Field mapping: input field name -> database column name
      const FIELD_MAPPING: Record<string, string> = {
        name: 'name',
        color: 'color',
        order: 'order_index',
      };

      // Whitelist of allowed update fields
      const ALLOWED_UPDATE_FIELDS = Object.keys(FIELD_MAPPING);

      return executeTransaction((db) => {
        // Check if team exists first
        const existing = db
          .prepare(
            `SELECT ${TEAM_SELECT_FIELDS}
            FROM team
            WHERE id = ? AND organizationId = ?`,
          )
          .get(id, this.organizationId) as TeamRow | undefined;

        if (!existing) {
          throw new Error(`Team ${id} not found`);
        }

        // Build update fields using whitelist
        const updateFields: string[] = [];
        const updateValues: (string | number | boolean)[] = [];

        for (const field of ALLOWED_UPDATE_FIELDS) {
          if ((updates as Record<string, unknown>)[field] !== undefined) {
            const columnName = FIELD_MAPPING[field];
            updateFields.push(`${columnName} = ?`);
            updateValues.push(
              (updates as Record<string, unknown>)[field] as string | number,
            );
          }
        }

        if (updateFields.length === 0) {
          throw new Error('No valid fields to update');
        }

        updateFields.push('updatedAt = ?');
        const updatedAt = new Date().toISOString();
        updateValues.push(updatedAt);
        updateValues.push(id, this.organizationId!);

        db.prepare(
          `UPDATE team SET ${updateFields.join(', ')} WHERE id = ? AND organizationId = ?`,
        ).run(...updateValues);

        // Return updated team
        const updatedTeam = db
          .prepare(
            `SELECT ${TEAM_SELECT_FIELDS}
            FROM team
            WHERE id = ? AND organizationId = ?`,
          )
          .get(id, this.organizationId) as TeamRow | undefined;

        const result = updatedTeam
          ? (convertSQLiteBooleans(
              updatedTeam as unknown as Record<string, unknown>,
              ['isSystem'],
            ) as unknown as Team)
          : null;

        logger.info(
          { action: 'updateTeam', teamId: id, updates },
          'Team updated',
        );
        return result;
      }, `updating team ${id}`);
    } catch (error) {
      logger.error(
        { action: 'updateTeam', err: error, teamId: id },
        'Failed to update team',
      );
      throw error;
    }
  }

  // Analysis migration handled automatically by beforeDeleteTeam hook
  async deleteTeam(
    id: string,
    headers: Record<string, string> = {},
    logger: Logger = moduleLogger,
  ): Promise<DeleteTeamResult> {
    try {
      logger.info({ action: 'deleteTeam', teamId: id }, 'Deleting team');

      const team = await this.getTeam(id, logger);
      if (!team) {
        throw new Error(`Team ${id} not found`);
      }

      logger.info(
        { action: 'deleteTeam', teamId: id, teamName: team.name },
        'Deleting team via better-auth API (beforeDeleteTeam hook will handle analysis migration)',
      );

      // Get auth via lazy loader to avoid circular dependencies
      const auth = await getAuth();

      const result = (await auth.api.removeTeam({
        body: {
          teamId: id,
          organizationId: this.organizationId!,
        },
        headers,
      })) as unknown as { error?: { message: string } } | null;

      if (result && 'error' in result && result.error) {
        throw new Error(
          `Failed to delete team via better-auth: ${result.error.message}`,
        );
      }

      logger.info(
        { action: 'deleteTeam', deletedTeamId: id, teamName: team.name },
        'Team deleted successfully (analysis migration handled by hook)',
      );

      return {
        deleted: id,
        name: team.name,
      };
    } catch (error) {
      logger.error(
        { action: 'deleteTeam', err: error, teamId: id },
        'Failed to delete team',
      );
      throw error;
    }
  }

  async getAnalysesByTeam(
    teamId: string,
    logger: Logger = moduleLogger,
  ): Promise<AnalysisConfig[]> {
    logger.info(
      { action: 'getAnalysesByTeam', teamId },
      'Getting analyses by team',
    );

    const team = await this.getTeam(teamId, logger);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const configData = await this.analysisService!.getConfig();
    const analyses: AnalysisConfig[] = [];

    if (configData.analyses) {
      for (const [analysisName, analysis] of Object.entries(
        configData.analyses,
      )) {
        if (analysis.teamId === teamId) {
          // Ensure the name property is set (might be redundant but safe)
          analyses.push({ ...analysis, name: analysisName });
        }
      }
    }

    logger.info(
      { action: 'getAnalysesByTeam', teamId, analysisCount: analyses.length },
      'Analyses retrieved',
    );
    return analyses;
  }

  async moveAnalysisToTeam(
    analysisId: string,
    teamId: string,
    logger: Logger = moduleLogger,
  ): Promise<MoveAnalysisResult> {
    logger.info(
      { action: 'moveAnalysisToTeam', analysisId, teamId },
      'Moving analysis to team',
    );

    const configData = await this.analysisService!.getConfig();

    const analysis = configData.analyses?.[analysisId];
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    const team = await this.getTeam(teamId, logger);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const previousTeam = analysis.teamId;

    if (previousTeam === teamId) {
      logger.info(
        { action: 'moveAnalysisToTeam', analysisId, teamId },
        'Analysis already in target team, no move needed',
      );
      return {
        analysisId,
        analysisName: analysis.name,
        from: previousTeam,
        to: teamId,
      };
    }

    analysis.teamId = teamId;
    analysis.lastModified = new Date().toISOString();

    await this.analysisService!.updateConfig(configData);

    // Remove from old team structure and add to new team
    if (previousTeam) {
      await this.removeItemFromTeamStructure(previousTeam, analysisId, logger);
    }

    const newItem: NewStructureItem = {
      id: analysisId,
      type: 'analysis',
    };
    await this.addItemToTeamStructure(teamId, newItem, null, logger);

    logger.info(
      {
        action: 'moveAnalysisToTeam',
        analysisId,
        analysisName: analysis.name,
        fromTeamId: previousTeam,
        toTeamId: teamId,
      },
      'Analysis moved to team and team structure updated',
    );

    return {
      analysisId,
      analysisName: analysis.name,
      from: previousTeam,
      to: teamId,
    };
  }

  // Ensure an analysis has a team assignment (defaults to uncategorized team)
  async ensureAnalysisHasTeam(analysisId: string): Promise<void> {
    const configData = await this.analysisService!.getConfig();

    if (
      configData.analyses?.[analysisId] &&
      !configData.analyses[analysisId].teamId
    ) {
      const teams = await this.getAllTeams();
      const uncategorizedTeam = teams.find((t) => t.name === 'Uncategorized');

      if (uncategorizedTeam) {
        configData.analyses[analysisId].teamId = uncategorizedTeam.id;
        await this.analysisService!.updateConfig(configData);
        moduleLogger.info(
          {
            analysisId,
            teamId: uncategorizedTeam.id,
          },
          'Assigned analysis to uncategorized team',
        );
      }
    }
  }

  async reorderTeams(
    orderedIds: string[],
    logger: Logger = moduleLogger,
  ): Promise<Team[]> {
    try {
      logger.info(
        { action: 'reorderTeams', teamCount: orderedIds.length },
        'Reordering teams',
      );

      return executeTransaction((db) => {
        const updateStmt = db.prepare(
          'UPDATE team SET order_index = ? WHERE id = ? AND organizationId = ?',
        );

        for (let i = 0; i < orderedIds.length; i++) {
          updateStmt.run(i, orderedIds[i], this.organizationId);
        }

        const teams = db
          .prepare(
            `SELECT ${TEAM_SELECT_FIELDS}
            FROM team
            WHERE organizationId = ?
            ORDER BY ${TEAM_ORDER_BY}`,
          )
          .all(this.organizationId) as TeamRow[];

        const teamsWithBoolean = convertSQLiteBooleansArray(
          teams as unknown as Record<string, unknown>[],
          ['isSystem'],
        ) as unknown as Team[];

        logger.info(
          { action: 'reorderTeams', teamCount: orderedIds.length, orderedIds },
          'Teams reordered',
        );
        return teamsWithBoolean;
      }, `reordering ${orderedIds.length} teams`);
    } catch (error) {
      logger.error(
        { action: 'reorderTeams', err: error },
        'Failed to reorder teams',
      );
      throw error;
    }
  }

  async getAnalysisCountByTeamId(
    teamId: string,
    logger: Logger = moduleLogger,
  ): Promise<number> {
    try {
      const analyses = await this.getAnalysesByTeam(teamId, logger);
      return analyses.length;
    } catch (error) {
      logger.error(
        { action: 'getAnalysisCountByTeamId', err: error, teamId },
        'Error getting analysis count for team',
      );
      return 0;
    }
  }

  // Generic tree traversal using visitor pattern
  // Stops early if visitor returns non-null/non-undefined value
  // Visitor: (item, parent, index) => result | null
  traverseTree<T>(
    items: TeamStructureItem[],
    visitor: (
      item: TeamStructureItem,
      parent: FolderStructureItem | null,
      index: number,
    ) => T | null | undefined,
    parent: FolderStructureItem | null = null,
  ): T | null {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const result = visitor(item, parent, i);
      if (result !== null && result !== undefined) return result;

      if (item.type === 'folder' && item.items) {
        const found = this.traverseTree(item.items, visitor, item);
        if (found !== null && found !== undefined) return found;
      }
    }
    return null;
  }

  findItemById(
    items: TeamStructureItem[],
    id: string,
  ): TeamStructureItem | null {
    return this.traverseTree(items, (item) => (item.id === id ? item : null));
  }

  findItemWithParent(items: TeamStructureItem[], id: string): FindItemResult {
    const result = this.traverseTree(items, (item, parent, index) =>
      item.id === id ? { parent, item, index } : null,
    );
    return result || { parent: null, item: null, index: -1 };
  }

  async addItemToTeamStructure(
    teamId: string,
    newItem: NewStructureItem,
    targetFolderId: string | null = null,
    logger: Logger = moduleLogger,
  ): Promise<void> {
    logger.info(
      { action: 'addItemToTeamStructure', teamId, targetFolderId },
      'Adding item to team structure',
    );

    const configData = await this.analysisService!.getConfig();

    if (!configData.teamStructure) {
      configData.teamStructure = {};
    }

    if (!configData.teamStructure[teamId]) {
      configData.teamStructure[teamId] = { items: [] };
    }

    const teamItems = configData.teamStructure[teamId].items;

    if (!targetFolderId) {
      teamItems.push(newItem as TeamStructureItem);
    } else {
      const targetFolder = this.findItemById(teamItems, targetFolderId);
      if (!targetFolder || targetFolder.type !== 'folder') {
        throw new Error('Target folder not found');
      }
      if (!targetFolder.items) {
        targetFolder.items = [];
      }
      targetFolder.items.push(newItem as TeamStructureItem);
    }

    await this.analysisService!.updateConfig(configData);
    logger.info(
      { action: 'addItemToTeamStructure', teamId, targetFolderId },
      'Item added to team structure',
    );
  }

  async removeItemFromTeamStructure(
    teamId: string,
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<void> {
    logger.info(
      { action: 'removeItemFromTeamStructure', teamId, analysisId },
      'Removing item from team structure',
    );

    const configData = await this.analysisService!.getConfig();

    if (!configData.teamStructure?.[teamId]) {
      return;
    }

    const result = this.traverseTree(
      configData.teamStructure[teamId].items,
      (item, parent, index) => {
        if (item.type === 'analysis' && item.id === analysisId) {
          const itemsArray = parent
            ? parent.items
            : configData.teamStructure![teamId].items;
          itemsArray.splice(index, 1);
          return true; // Return true to stop traversal
        }
        return null;
      },
    );

    const removed = result === true;
    await this.analysisService!.updateConfig(configData);
    logger.info(
      { action: 'removeItemFromTeamStructure', teamId, analysisId, removed },
      'Item removed from team structure',
    );
  }

  async createFolder(
    teamId: string,
    parentFolderId: string | null,
    name: string,
    logger: Logger = moduleLogger,
  ): Promise<FolderStructureItem> {
    logger.info(
      { action: 'createFolder', teamId, parentFolderId, name },
      'Creating folder',
    );

    const configData = await this.analysisService!.getConfig();

    const team = await this.getTeam(teamId, logger);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    if (!configData.teamStructure) {
      configData.teamStructure = {};
    }

    if (!configData.teamStructure[teamId]) {
      configData.teamStructure[teamId] = { items: [] };
    }

    const newFolder: FolderStructureItem = {
      id: generateId(),
      type: 'folder',
      name: name,
      items: [],
    };

    const teamItems = configData.teamStructure[teamId].items;

    if (!parentFolderId) {
      teamItems.push(newFolder);
    } else {
      const parent = this.findItemById(teamItems, parentFolderId);
      if (!parent || parent.type !== 'folder') {
        throw new Error('Parent folder not found');
      }
      if (!parent.items) {
        parent.items = [];
      }
      parent.items.push(newFolder);
    }

    await this.analysisService!.updateConfig(configData);

    logger.info(
      {
        action: 'createFolder',
        teamId,
        folderId: newFolder.id,
        name,
        parentFolderId,
      },
      'Folder created',
    );

    return newFolder;
  }

  async updateFolder(
    teamId: string,
    folderId: string,
    updates: FolderUpdateInput,
    logger: Logger = moduleLogger,
  ): Promise<FolderStructureItem> {
    logger.info(
      { action: 'updateFolder', teamId, folderId, updates },
      'Updating folder',
    );

    const configData = await this.analysisService!.getConfig();

    if (!configData.teamStructure?.[teamId]) {
      throw new Error(`Team ${teamId} not found in structure`);
    }

    const folder = this.findItemById(
      configData.teamStructure[teamId].items,
      folderId,
    );

    if (!folder || folder.type !== 'folder') {
      throw new Error(`Folder ${folderId} not found`);
    }

    if (updates.name !== undefined) {
      folder.name = updates.name;
    }
    if (updates.expanded !== undefined) {
      folder.expanded = updates.expanded;
    }

    await this.analysisService!.updateConfig(configData);

    logger.info(
      { action: 'updateFolder', teamId, folderId, updates },
      'Folder updated',
    );

    return folder;
  }

  // Delete a folder (move children to parent or root)
  async deleteFolder(
    teamId: string,
    folderId: string,
    logger: Logger = moduleLogger,
  ): Promise<DeleteFolderResult> {
    logger.info(
      { action: 'deleteFolder', teamId, folderId },
      'Deleting folder',
    );

    const configData = await this.analysisService!.getConfig();

    if (!configData.teamStructure?.[teamId]) {
      throw new Error(`Team ${teamId} not found in structure`);
    }

    const teamItems = configData.teamStructure[teamId].items;

    const { parent, item, index } = this.findItemWithParent(
      teamItems,
      folderId,
    );

    if (!item || item.type !== 'folder') {
      throw new Error(`Folder ${folderId} not found`);
    }

    // Move children to parent
    const children = item.items || [];
    if (parent) {
      parent.items.splice(index, 1, ...children);
    } else {
      teamItems.splice(index, 1, ...children);
    }

    await this.analysisService!.updateConfig(configData);

    logger.info(
      {
        action: 'deleteFolder',
        teamId,
        folderId,
        childrenMoved: children.length,
      },
      'Folder deleted',
    );

    return { deleted: folderId, childrenMoved: children.length };
  }

  async moveItem(
    teamId: string,
    itemId: string,
    targetParentId: string | null,
    targetIndex: number,
    logger: Logger = moduleLogger,
  ): Promise<MoveItemResult> {
    logger.info(
      { action: 'moveItem', teamId, itemId, targetParentId, targetIndex },
      'Moving item in tree',
    );

    const configData = await this.analysisService!.getConfig();

    if (!configData.teamStructure?.[teamId]) {
      throw new Error(`Team ${teamId} not found in structure`);
    }

    const teamItems = configData.teamStructure[teamId].items;

    const {
      parent: sourceParent,
      item,
      index: sourceIndex,
    } = this.findItemWithParent(teamItems, itemId);

    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    // Prevent moving folder into itself
    if (item.type === 'folder' && targetParentId === itemId) {
      throw new Error('Cannot move folder into itself');
    }

    // Prevent moving folder into its own descendant
    if (item.type === 'folder' && targetParentId) {
      const isDescendant = this.traverseTree(item.items || [], (child) =>
        child.id === targetParentId ? true : null,
      );

      if (isDescendant) {
        throw new Error('Cannot move folder into its own descendant');
      }
    }

    const sourceArray = sourceParent ? sourceParent.items : teamItems;
    sourceArray.splice(sourceIndex, 1);

    if (!targetParentId) {
      teamItems.splice(targetIndex, 0, item);
    } else {
      const targetParent = this.findItemById(teamItems, targetParentId);
      if (!targetParent || targetParent.type !== 'folder') {
        throw new Error('Target parent must be a folder');
      }
      if (!targetParent.items) {
        targetParent.items = [];
      }
      targetParent.items.splice(targetIndex, 0, item);
    }

    await this.analysisService!.updateConfig(configData);

    logger.info(
      { action: 'moveItem', teamId, itemId, targetParentId, targetIndex },
      'Item moved in tree',
    );

    return { moved: itemId, to: targetParentId || 'root' };
  }
}

// Singleton instance
const teamService = new TeamService();

export { teamService, TeamService };
