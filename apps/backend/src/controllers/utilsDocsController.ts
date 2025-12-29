import type { Request, Response } from 'express';
import type { Logger } from 'pino';
import { getUtilsSpecs } from '../docs/utilsSwagger.ts';

/** Express request with optional request-scoped logger */
type RequestWithLogger = Request & {
  log?: Logger;
};

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
   */
  static getUtilsDocs(req: RequestWithLogger, res: Response): void {
    req.log?.info({ action: 'getUtilsDocs' }, 'Getting utility documentation');

    try {
      const specs = getUtilsSpecs() as { paths?: Record<string, unknown> };

      // Count paths for logging
      const pathCount = Object.keys(specs.paths || {}).length;

      req.log?.info(
        { action: 'getUtilsDocs', pathCount },
        'Utility documentation retrieved',
      );

      res.json(specs);
    } catch (error) {
      req.log?.error(
        { err: error, action: 'getUtilsDocs' },
        'Failed to generate utility documentation',
      );

      res.status(500).json({
        error: 'Failed to retrieve utility documentation',
        message: (error as Error).message,
      });
    }
  }
}
