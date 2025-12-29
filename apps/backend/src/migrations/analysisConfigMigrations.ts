/**
 * Analysis Config Migrations
 * Handles version upgrades for analyses-config.json
 * @module analysisConfigMigrations
 */
import path from 'path';
import { config } from '../config/default.ts';
import { safeWriteFile, safeRename, safeStat } from '../utils/safePath.ts';
import { createChildLogger } from '../utils/logging/logger.ts';
import { generateId } from '../utils/generateId.ts';

const logger = createChildLogger('analysis-config-migration');

/** Analysis configuration */
interface AnalysisConfig {
  enabled?: boolean;
  intendedState?: string;
  lastStartTime?: string;
  teamId?: string;
  type?: string;
}

/** Team structure item */
interface TeamStructureItem {
  id: string;
  type: 'analysis' | 'folder';
  analysisName?: string;
  name?: string;
  items?: TeamStructureItem[];
}

/** Team structure data */
interface TeamStructureData {
  items?: TeamStructureItem[];
}

/** Config data structure */
interface ConfigData {
  version?: string;
  analyses?: Record<string, AnalysisConfig>;
  teamStructure?: Record<string, TeamStructureData>;
}

/** Rename task */
interface RenameTask {
  oldPath: string;
  newPath: string;
  oldName: string;
  newId: string;
}

/** Filesystem error with code */
interface FsError extends Error {
  code?: string;
}

/**
 * Migrate configuration from pre-v4.0 to v4.0 (nested folder structure)
 * @param configData - The config data to migrate
 * @param configPath - Path to config file for saving
 * @returns Whether migration was performed
 */
export async function migrateConfigToV4_0(
  configData: ConfigData,
  configPath: string,
): Promise<boolean> {
  const currentVersion = parseFloat(configData.version || '1.0');
  const needsMigration =
    currentVersion < 4.0 ||
    !configData.teamStructure ||
    Object.keys(configData.teamStructure).length === 0;

  if (
    !needsMigration ||
    !configData.analyses ||
    Object.keys(configData.analyses).length === 0
  ) {
    return false;
  }

  logger.info(
    `Migrating config from v${configData.version} to v4.0 (nested folder structure)`,
  );
  configData.version = '4.0';
  configData.teamStructure = {};

  // Group analyses by team
  const teamGroups: Record<string, string[]> = {};
  for (const [analysisName, analysis] of Object.entries(
    configData.analyses || {},
  )) {
    const teamId = analysis.teamId || 'uncategorized';
    if (!teamGroups[teamId]) teamGroups[teamId] = [];
    teamGroups[teamId].push(analysisName);
  }

  // Create flat items structure for each team (no folders initially)
  for (const [teamId, analysisNames] of Object.entries(teamGroups)) {
    configData.teamStructure[teamId] = {
      items: analysisNames.map((name) => ({
        id: generateId(),
        type: 'analysis' as const,
        analysisName: name,
      })),
    };
  }

  // Save migrated config
  await safeWriteFile(
    configPath,
    JSON.stringify(configData, null, 2),
    config.paths.config,
  );
  logger.info(
    {
      teamsCount: Object.keys(configData.teamStructure).length,
      analysisCount: Object.keys(configData.analyses || {}).length,
    },
    'Successfully migrated config to v4.0',
  );

  return true;
}

/**
 * Migrate configuration from v4.0 to v4.1 (remove deprecated type field)
 * @param configData - The config data to migrate
 * @param configPath - Path to config file for saving
 * @returns Whether migration was performed
 */
export async function migrateConfigToV4_1(
  configData: ConfigData,
  configPath: string,
): Promise<boolean> {
  if (configData.version !== '4.0') {
    return false;
  }

  logger.info('Migrating config from v4.0 to v4.1 (remove type field)');

  let removedCount = 0;
  for (const analysis of Object.values(configData.analyses || {})) {
    if ('type' in analysis) {
      delete analysis.type;
      removedCount++;
    }
  }

  configData.version = '4.1';

  // Save migrated config
  await safeWriteFile(
    configPath,
    JSON.stringify(configData, null, 2),
    config.paths.config,
  );
  logger.info(
    {
      analysisCount: Object.keys(configData.analyses || {}).length,
      removedTypeFields: removedCount,
    },
    'Successfully migrated config to v4.1',
  );

  return true;
}

/**
 * Migrate team structure items to use analysisId instead of analysisName
 * @param items - Team structure items array
 * @param analysisIdMap - Map of oldName -> newId
 * @returns Migrated items
 */
function migrateTeamStructureItems(
  items: TeamStructureItem[],
  analysisIdMap: Record<string, string>,
): TeamStructureItem[] {
  return items
    .map((item): TeamStructureItem | null => {
      if (item.type === 'analysis') {
        const newId = item.analysisName
          ? analysisIdMap[item.analysisName]
          : undefined;
        if (!newId) {
          logger.warn(
            { analysisName: item.analysisName },
            'Analysis not found in ID map during migration, removing from team structure',
          );
          return null;
        }
        // Return new structure: id is the analysisId, no more analysisName property
        return { id: newId, type: 'analysis' };
      } else if (item.type === 'folder') {
        return {
          id: item.id,
          type: 'folder',
          name: item.name,
          items: item.items
            ? migrateTeamStructureItems(item.items, analysisIdMap)
            : [],
        };
      }
      return item;
    })
    .filter((item): item is TeamStructureItem => item !== null);
}

/**
 * Migrate configuration from v4.1 to v5.0 (analysisId as primary identifier)
 * - Generates UUIDs for all analyses
 * - Renames filesystem directories from name to ID
 * - Updates team structure to reference by ID only
 * @param configData - The config data to migrate
 * @param configPath - Path to config file for saving
 * @returns Whether migration was performed
 */
export async function migrateConfigToV5_0(
  configData: ConfigData,
  configPath: string,
): Promise<boolean> {
  if (configData.version !== '4.1') {
    return false;
  }

  logger.info(
    'Migrating config from v4.1 to v5.0 (analysisId as primary identifier)',
  );

  const migratedAnalyses: Record<
    string,
    AnalysisConfig & { id: string; name: string }
  > = {};
  const analysisIdMap: Record<string, string> = {}; // oldName -> newId mapping

  // Step 1: Generate UUIDs and build new analyses structure
  for (const [analysisName, analysisConfig] of Object.entries(
    configData.analyses || {},
  )) {
    const analysisId = generateId();
    analysisIdMap[analysisName] = analysisId;

    migratedAnalyses[analysisId] = {
      id: analysisId,
      name: analysisName,
      enabled: analysisConfig.enabled,
      intendedState: analysisConfig.intendedState || 'stopped',
      lastStartTime: analysisConfig.lastStartTime,
      teamId: analysisConfig.teamId,
    };
  }

  logger.info(
    { analysisCount: Object.keys(analysisIdMap).length },
    'Generated UUIDs for analyses',
  );

  // Step 2: Rename filesystem directories from name to ID
  // First, verify all source directories exist
  const renameTasks: RenameTask[] = [];
  for (const [oldName, newId] of Object.entries(analysisIdMap)) {
    const oldPath = path.join(config.paths.analysis, oldName);
    const newPath = path.join(config.paths.analysis, newId);

    try {
      const stats = await safeStat(oldPath, config.paths.analysis);
      if (stats.isDirectory()) {
        renameTasks.push({ oldPath, newPath, oldName, newId });
      }
    } catch (error) {
      const fsError = error as FsError;
      if (fsError.code === 'ENOENT') {
        logger.warn(
          { analysisName: oldName },
          'Analysis directory not found, skipping rename',
        );
      } else {
        throw error;
      }
    }
  }

  // Perform renames
  for (const task of renameTasks) {
    try {
      await safeRename(task.oldPath, task.newPath, config.paths.analysis);
      logger.debug(
        { from: task.oldName, to: task.newId },
        'Renamed analysis directory',
      );
    } catch (error) {
      const err = error as Error;
      logger.error(
        { error, from: task.oldName, to: task.newId },
        'Failed to rename analysis directory',
      );
      throw new Error(
        `Migration failed: Could not rename ${task.oldName} to ${task.newId}: ${err.message}`,
      );
    }
  }

  logger.info(
    { renamedCount: renameTasks.length },
    'Renamed analysis directories',
  );

  // Step 3: Update team structure references
  const migratedTeamStructure: Record<string, TeamStructureData> = {};
  for (const [teamId, teamData] of Object.entries(
    configData.teamStructure || {},
  )) {
    migratedTeamStructure[teamId] = {
      items: teamData.items
        ? migrateTeamStructureItems(teamData.items, analysisIdMap)
        : [],
    };
  }

  // Step 4: Build final config
  const migratedConfig: ConfigData = {
    version: '5.0',
    analyses: migratedAnalyses,
    teamStructure: migratedTeamStructure,
  };

  // Save migrated config
  await safeWriteFile(
    configPath,
    JSON.stringify(migratedConfig, null, 2),
    config.paths.config,
  );

  // Update the passed configData object in place
  Object.assign(configData, migratedConfig);

  logger.info(
    {
      analysisCount: Object.keys(migratedAnalyses).length,
      teamCount: Object.keys(migratedTeamStructure).length,
      renamedDirectories: renameTasks.length,
    },
    'Successfully migrated config to v5.0',
  );

  return true;
}

/**
 * Run all analysis config migrations in sequence
 * @param configData - The config data to migrate
 * @param configPath - Path to config file for saving
 * @returns The migrated config data
 */
export async function runAnalysisConfigMigrations(
  configData: ConfigData,
  configPath: string,
): Promise<ConfigData> {
  // Run migrations in sequence
  await migrateConfigToV4_0(configData, configPath);
  await migrateConfigToV4_1(configData, configPath);
  await migrateConfigToV5_0(configData, configPath);

  return configData;
}

/**
 * Validate that config is at current version
 * @param configData - The config data to validate
 * @returns Whether config is at current version
 */
export function isConfigAtCurrentVersion(configData: ConfigData): boolean {
  return configData.version === '5.0';
}

/**
 * Get the current config version
 * @returns Current config version
 */
export function getCurrentConfigVersion(): string {
  return '5.0';
}
