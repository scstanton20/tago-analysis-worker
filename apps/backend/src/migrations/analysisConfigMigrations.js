/**
 * Analysis Config Migrations
 * Handles version upgrades for analyses-config.json
 * @module analysisConfigMigrations
 */
import path from 'path';
import { config } from '../config/default.js';
import { safeWriteFile, safeRename, safeStat } from '../utils/safePath.js';
import { createChildLogger } from '../utils/logging/logger.js';
import { generateId } from '../utils/generateId.js';

const logger = createChildLogger('analysis-config-migration');

/**
 * Migrate configuration from pre-v4.0 to v4.0 (nested folder structure)
 * @param {Object} configData - The config data to migrate
 * @param {string} configPath - Path to config file for saving
 * @returns {Promise<boolean>} Whether migration was performed
 */
export async function migrateConfigToV4_0(configData, configPath) {
  const currentVersion = parseFloat(configData.version) || 1.0;
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
  const teamGroups = {};
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
        type: 'analysis',
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
 * @param {Object} configData - The config data to migrate
 * @param {string} configPath - Path to config file for saving
 * @returns {Promise<boolean>} Whether migration was performed
 */
export async function migrateConfigToV4_1(configData, configPath) {
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
 * @param {Array} items - Team structure items array
 * @param {Object} analysisIdMap - Map of oldName -> newId
 * @returns {Array} Migrated items
 */
function migrateTeamStructureItems(items, analysisIdMap) {
  return items
    .map((item) => {
      if (item.type === 'analysis') {
        const newId = analysisIdMap[item.analysisName];
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
    .filter(Boolean);
}

/**
 * Migrate configuration from v4.1 to v5.0 (analysisId as primary identifier)
 * - Generates UUIDs for all analyses
 * - Renames filesystem directories from name to ID
 * - Updates team structure to reference by ID only
 * @param {Object} configData - The config data to migrate
 * @param {string} configPath - Path to config file for saving
 * @returns {Promise<boolean>} Whether migration was performed
 */
export async function migrateConfigToV5_0(configData, configPath) {
  if (configData.version !== '4.1') {
    return false;
  }

  logger.info(
    'Migrating config from v4.1 to v5.0 (analysisId as primary identifier)',
  );

  const migratedAnalyses = {};
  const analysisIdMap = {}; // oldName -> newId mapping

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
  const renameTasks = [];
  for (const [oldName, newId] of Object.entries(analysisIdMap)) {
    const oldPath = path.join(config.paths.analysis, oldName);
    const newPath = path.join(config.paths.analysis, newId);

    try {
      const stats = await safeStat(oldPath, config.paths.analysis);
      if (stats.isDirectory()) {
        renameTasks.push({ oldPath, newPath, oldName, newId });
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
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
      logger.error(
        { error, from: task.oldName, to: task.newId },
        'Failed to rename analysis directory',
      );
      throw new Error(
        `Migration failed: Could not rename ${task.oldName} to ${task.newId}: ${error.message}`,
      );
    }
  }

  logger.info(
    { renamedCount: renameTasks.length },
    'Renamed analysis directories',
  );

  // Step 3: Update team structure references
  const migratedTeamStructure = {};
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
  const migratedConfig = {
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
 * @param {Object} configData - The config data to migrate
 * @param {string} configPath - Path to config file for saving
 * @returns {Promise<Object>} The migrated config data
 */
export async function runAnalysisConfigMigrations(configData, configPath) {
  // Run migrations in sequence
  await migrateConfigToV4_0(configData, configPath);
  await migrateConfigToV4_1(configData, configPath);
  await migrateConfigToV5_0(configData, configPath);

  return configData;
}

/**
 * Validate that config is at current version
 * @param {Object} configData - The config data to validate
 * @returns {boolean} Whether config is at current version
 */
export function isConfigAtCurrentVersion(configData) {
  return configData.version === '5.0';
}

/**
 * Get the current config version
 * @returns {string} Current config version
 */
export function getCurrentConfigVersion() {
  return '5.0';
}
