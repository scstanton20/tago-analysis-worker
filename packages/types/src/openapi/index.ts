/**
 * OpenAPI Module
 *
 * Exports OpenAPI schemas, types, and generator functions.
 */

// Re-export generator functions and registry
export {
  generateOpenAPISchemas,
  generateOpenAPIDocument,
  registry,
} from './generator.js';

// Re-export OpenAPI classes for creating additional registries and generators
export {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';

// Re-export the OpenAPI-extended z instance
export { z } from './setup.js';

// Re-export all schemas
export * from './schemas.js';
