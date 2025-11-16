import { getUtilsSpecs } from '../docs/utilsSwagger.js';

/**
 * Controller class for managing utility documentation
 * Provides endpoints to retrieve Swagger-generated documentation for utility modules
 *
 * All methods are static and follow Express route handler pattern (req, res).
 * Request-scoped logging is available via req.log.
 */
export class UtilsDocsController {
  /**
   * Retrieve OpenAPI specification for all utilities
   * Returns complete Swagger/OpenAPI documentation for all utility modules
   *
   * @param {Object} req - Express request object
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {void}
   *
   * Response:
   * - JSON object with OpenAPI specification
   */
  static getUtilsDocs(req, res) {
    req.log.info({ action: 'getUtilsDocs' }, 'Getting utility documentation');

    try {
      const specs = getUtilsSpecs();

      // Count paths for logging
      const pathCount = Object.keys(specs.paths || {}).length;

      req.log.info(
        { action: 'getUtilsDocs', pathCount },
        'Utility documentation retrieved',
      );

      res.json(specs);
    } catch (error) {
      req.log.error(
        { err: error, action: 'getUtilsDocs' },
        'Failed to generate utility documentation',
      );

      res.status(500).json({
        error: 'Failed to retrieve utility documentation',
        message: error.message,
      });
    }
  }
}
