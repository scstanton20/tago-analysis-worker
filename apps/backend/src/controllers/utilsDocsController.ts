import type { Request, Response } from 'express';
import type { Logger } from 'pino';
import {
  getUtilsSpecs,
  getAvailablePackages,
  getAvailableUtilities,
} from '../docs/utilsSwagger.ts';

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
   * Retrieve overview of available packages and utilities
   * Returns simple lists without detailed OpenAPI specs
   */
  static getOverview(req: RequestWithLogger, res: Response): void {
    req.log?.info({ action: 'getOverview' }, 'Getting utils overview');

    try {
      const packages = getAvailablePackages();
      const utilities = getAvailableUtilities();

      req.log?.info(
        {
          action: 'getOverview',
          packageCount: packages.length,
          utilityCount: utilities.length,
        },
        'Utils overview retrieved',
      );

      res.json({ packages, utilities });
    } catch (error) {
      req.log?.error(
        { err: error, action: 'getOverview' },
        'Failed to get utils overview',
      );

      res.status(500).json({
        error: 'Failed to retrieve utils overview',
        message: (error as Error).message,
      });
    }
  }

  /**
   * Retrieve list of available packages for analysis scripts
   * Returns packages that can be imported directly in analysis code
   */
  static getPackages(req: RequestWithLogger, res: Response): void {
    req.log?.info({ action: 'getPackages' }, 'Getting available packages');

    try {
      const packages = getAvailablePackages();

      req.log?.info(
        { action: 'getPackages', count: packages.length },
        'Available packages retrieved',
      );

      res.json(packages);
    } catch (error) {
      req.log?.error(
        { err: error, action: 'getPackages' },
        'Failed to get available packages',
      );

      res.status(500).json({
        error: 'Failed to retrieve available packages',
        message: (error as Error).message,
      });
    }
  }

  /**
   * Retrieve OpenAPI specification for all in-process utilities
   * Returns complete Swagger/OpenAPI documentation for utility functions
   */
  static getUtilities(req: RequestWithLogger, res: Response): void {
    req.log?.info({ action: 'getUtilities' }, 'Getting utility documentation');

    try {
      const specs = getUtilsSpecs() as { paths?: Record<string, unknown> };

      // Count paths for logging
      const pathCount = Object.keys(specs.paths || {}).length;

      req.log?.info(
        { action: 'getUtilities', pathCount },
        'Utility documentation retrieved',
      );

      res.json(specs);
    } catch (error) {
      req.log?.error(
        { err: error, action: 'getUtilities' },
        'Failed to generate utility documentation',
      );

      res.status(500).json({
        error: 'Failed to retrieve utility documentation',
        message: (error as Error).message,
      });
    }
  }
}
