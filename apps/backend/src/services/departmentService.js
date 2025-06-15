import { v4 as uuidv4 } from 'uuid';

class DepartmentService {
  constructor() {
    this.analysisService = null;
    this.initialized = false;
  }

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

  // Department CRUD operations
  async getAllDepartments() {
    const config = await this.analysisService.getConfig();
    const departments = Object.values(config.departments || {});
    return departments.sort((a, b) => a.order - b.order);
  }

  async getDepartment(id) {
    const config = await this.analysisService.getConfig();
    return config.departments?.[id];
  }

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

  // Analysis-Department operations
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

  // Helper method for analysis service integration
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

  // Bulk operations
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
