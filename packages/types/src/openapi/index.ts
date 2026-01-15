/**
 * OpenAPI Module
 *
 * Exports OpenAPI schemas, types, and generator functions.
 */

// Re-export generator functions
export {
  generateOpenAPISchemas,
  generateOpenAPIDocument,
  registry,
} from './generator.js';

// Re-export all schemas
export * from './schemas.js';
