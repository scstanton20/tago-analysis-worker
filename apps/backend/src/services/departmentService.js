import { v4 as uuidv4 } from 'uuid';

/**
 * Service class for managing departments and their relationships with analyses
 * Handles department CRUD operations, analysis-department assignments, and config migration
 */
class DepartmentService {
  constructor() {
    /** @type {Object|null} Reference to the analysis service instance */
    this.analysisService = null;
    /** @type {boolean} Whether the service has been initialized */
    this.initialized = false;
  }

  /**
   * Initialize the department service with analysis service integration
   * @param {Object} analysisService - Analysis service instance for config management
   * @returns {Promise<void>}
   * @throws {Error} If initialization or migration fails
   */
  async initialize(analysisService) {
    if (this.initialized) return;

    this.analysisService = analysisService;

    try {
      // Check if migration is needed
      const config = await this.analysisService.getConfig();
      if (!config.version || config.version < '2.0') {
        await this.migrateConfig();
      }

      this.initialized = true;
      console.log('Department service initialized');
    } catch (error) {
      console.error('Failed to initialize department service:', error);
      throw error;
    }
  }

  /**
   * Migrate configuration from older versions to version 2.0
   * Creates default uncategorized department and ensures all analyses have department assignments
   * @returns {Promise<void>}
   * @throws {Error} If migration fails
   */
  async migrateConfig() {
    console.log('Migrating config to version 2.0...');

    const config = await this.analysisService.getConfig();

    // Create default uncategorized department if it doesn't exist
    if (!config.departments) {
      config.departments = {};
    }

    if (!config.departments.uncategorized) {
      config.departments.uncategorized = {
        id: 'uncategorized',
        name: 'Uncategorized',
        color: '#9ca3af',
        order: 0,
        created: new Date().toISOString(),
        isSystem: true,
      };
    }

    // Migrate analyses to have department field
    if (config.analyses) {
      Object.keys(config.analyses).forEach((name) => {
        if (!config.analyses[name].department) {
          config.analyses[name].department = 'uncategorized';
        }
      });
    }

    // Update version
    config.version = '2.0';

    await this.analysisService.updateConfig(config);
    console.log('Migration completed');
  }

  /**
   * Get all departments sorted by order
   * @returns {Promise<Array>} Array of department objects sorted by order
   * @throws {Error} If config retrieval fails
   */
  async getAllDepartments() {
    const config = await this.analysisService.getConfig();
    const departments = Object.values(config.departments || {});
    return departments.sort((a, b) => a.order - b.order);
  }

  /**
   * Get a specific department by ID
   * @param {string} id - Department ID to retrieve
   * @returns {Promise<Object|undefined>} Department object or undefined if not found
   * @throws {Error} If config retrieval fails
   */
  async getDepartment(id) {
    const config = await this.analysisService.getConfig();
    return config.departments?.[id];
  }

  /**
   * Create a new department
   * @param {Object} data - Department data
   * @param {string} data.name - Department name
   * @param {string} [data.color='#3b82f6'] - Department color (hex code)
   * @param {string} [data.id] - Custom department ID (generates UUID if not provided)
   * @param {number} [data.order] - Display order (defaults to end of list)
   * @returns {Promise<Object>} Created department object
   * @throws {Error} If department with ID already exists or creation fails
   */
  async createDepartment(data) {
    const config = await this.analysisService.getConfig();

    if (!config.departments) {
      config.departments = {};
    }

    const id = data.id || uuidv4();
    if (config.departments[id]) {
      throw new Error(`Department with id ${id} already exists`);
    }

    const department = {
      id,
      name: data.name,
      color: data.color || '#3b82f6',
      order: data.order ?? Object.keys(config.departments).length,
      created: new Date().toISOString(),
      isSystem: false,
    };

    config.departments[id] = department;
    await this.analysisService.updateConfig(config);

    return department;
  }

  /**
   * Update an existing department
   * @param {string} id - Department ID to update
   * @param {Object} updates - Updates to apply
   * @param {string} [updates.name] - New department name
   * @param {string} [updates.color] - New department color
   * @param {number} [updates.order] - New display order
   * @returns {Promise<Object>} Updated department object
   * @throws {Error} If department not found, system department modification attempted, or update fails
   */
  async updateDepartment(id, updates) {
    const config = await this.analysisService.getConfig();

    const department = config.departments?.[id];
    if (!department) {
      throw new Error(`Department ${id} not found`);
    }

    // Don't allow updating system departments' critical fields
    if (department.isSystem && (updates.id || updates.isSystem !== undefined)) {
      throw new Error('Cannot modify system department');
    }

    const updated = {
      ...department,
      ...updates,
      id, // Ensure ID cannot be changed
      updated: new Date().toISOString(),
    };

    config.departments[id] = updated;
    await this.analysisService.updateConfig(config);

    return updated;
  }

  /**
   * Delete a department and optionally move its analyses to another department
   * @param {string} id - Department ID to delete
   * @param {string} [moveAnalysesTo='uncategorized'] - Department ID to move analyses to
   * @returns {Promise<Object>} Deletion result with moved analysis count
   * @throws {Error} If department not found, system department deletion attempted, or deletion fails
   */
  async deleteDepartment(id, moveAnalysesTo = 'uncategorized') {
    const config = await this.analysisService.getConfig();

    const department = config.departments?.[id];
    if (!department) {
      throw new Error(`Department ${id} not found`);
    }

    if (department.isSystem) {
      throw new Error('Cannot delete system department');
    }

    // Move all analyses from this department
    let analysesMovedCount = 0;
    if (config.analyses) {
      Object.keys(config.analyses).forEach((name) => {
        if (config.analyses[name].department === id) {
          config.analyses[name].department = moveAnalysesTo;
          analysesMovedCount++;
        }
      });
    }

    delete config.departments[id];

    // Reorder remaining departments
    const remaining = Object.values(config.departments).sort(
      (a, b) => a.order - b.order,
    );
    remaining.forEach((dept, index) => {
      dept.order = index;
      config.departments[dept.id] = dept;
    });

    await this.analysisService.updateConfig(config);

    return {
      deleted: id,
      analysesMovedTo: moveAnalysesTo,
      analysesMovedCount,
    };
  }

  /**
   * Reorder departments by providing new order of IDs
   * @param {string[]} orderedIds - Array of department IDs in desired order
   * @returns {Promise<Array>} Updated departments array sorted by new order
   * @throws {Error} If any department ID is not found or reorder fails
   */
  async reorderDepartments(orderedIds) {
    const config = await this.analysisService.getConfig();

    // Validate all IDs exist
    for (const id of orderedIds) {
      if (!config.departments?.[id]) {
        throw new Error(`Department ${id} not found`);
      }
    }

    // Update order
    orderedIds.forEach((id, index) => {
      config.departments[id].order = index;
    });

    await this.analysisService.updateConfig(config);

    return this.getAllDepartments();
  }

  /**
   * Get all analyses belonging to a specific department
   * @param {string} departmentId - Department ID to get analyses for
   * @returns {Promise<Array>} Array of analysis objects with name and metadata
   * @throws {Error} If department not found or config retrieval fails
   */
  async getAnalysesByDepartment(departmentId) {
    const config = await this.analysisService.getConfig();

    if (!config.departments?.[departmentId]) {
      throw new Error(`Department ${departmentId} not found`);
    }

    const analyses = [];
    if (config.analyses) {
      Object.entries(config.analyses).forEach(([name, analysis]) => {
        if (analysis.department === departmentId) {
          analyses.push({ name, ...analysis });
        }
      });
    }

    return analyses;
  }

  /**
   * Move an analysis to a different department
   * @param {string} analysisName - Name of the analysis to move
   * @param {string} departmentId - Target department ID
   * @returns {Promise<Object>} Move result with from/to department info
   * @throws {Error} If analysis or department not found, or move fails
   */
  async moveAnalysisToDepartment(analysisName, departmentId) {
    const config = await this.analysisService.getConfig();

    const analysis = config.analyses?.[analysisName];
    if (!analysis) {
      throw new Error(`Analysis ${analysisName} not found`);
    }

    if (!config.departments?.[departmentId]) {
      throw new Error(`Department ${departmentId} not found`);
    }

    const previousDepartment = analysis.department;
    analysis.department = departmentId;
    analysis.lastModified = new Date().toISOString();

    await this.analysisService.updateConfig(config);

    return {
      analysis: analysisName,
      from: previousDepartment,
      to: departmentId,
    };
  }

  /**
   * Ensure an analysis has a department assignment (defaults to uncategorized)
   * @param {string} analysisName - Name of the analysis to check
   * @returns {Promise<void>}
   * @throws {Error} If config update fails
   */
  async ensureAnalysisHasDepartment(analysisName) {
    const config = await this.analysisService.getConfig();

    if (
      config.analyses?.[analysisName] &&
      !config.analyses[analysisName].department
    ) {
      config.analyses[analysisName].department = 'uncategorized';
      await this.analysisService.updateConfig(config);
    }
  }

  /**
   * Move multiple analyses to a target department in a single operation
   * @param {string[]} analysisNames - Array of analysis names to move
   * @param {string} targetDepartmentId - Target department ID
   * @returns {Promise<Array>} Array of move results with success/failure status for each analysis
   * @throws {Error} If target department not found or config update fails
   */
  async bulkMoveAnalyses(analysisNames, targetDepartmentId) {
    const config = await this.analysisService.getConfig();

    if (!config.departments?.[targetDepartmentId]) {
      throw new Error(`Department ${targetDepartmentId} not found`);
    }

    const results = [];
    for (const name of analysisNames) {
      try {
        if (config.analyses?.[name]) {
          const previousDepartment = config.analyses[name].department;
          config.analyses[name].department = targetDepartmentId;
          config.analyses[name].lastModified = new Date().toISOString();
          results.push({
            success: true,
            analysis: name,
            from: previousDepartment,
            to: targetDepartmentId,
          });
        } else {
          results.push({
            success: false,
            analysis: name,
            error: 'Analysis not found',
          });
        }
      } catch (error) {
        results.push({
          success: false,
          analysis: name,
          error: error.message,
        });
      }
    }

    await this.analysisService.updateConfig(config);
    return results;
  }
}

// Singleton instance
const departmentService = new DepartmentService();

export { departmentService as default, DepartmentService };
