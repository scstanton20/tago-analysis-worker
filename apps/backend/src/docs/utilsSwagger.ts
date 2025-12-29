import swaggerJSDoc, { type OAS3Options } from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Swagger configuration for in-process utility documentation
 * This is separate from the main API docs and not exposed through Swagger UI
 */
const utilsOptions: OAS3Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Tago Analysis Utilities',
      version: '1.0.0',
    },
    components: {
      schemas: {},
    },
  },
  // Point to the in-process-utils directory - support both .ts and .js
  apis: [
    path.join(__dirname, '../utils/in-process-utils/*.ts'),
    path.join(__dirname, '../utils/in-process-utils/*.js'),
  ],
};

/**
 * Generate utility documentation specs
 * @returns OpenAPI specification object
 */
export function getUtilsSpecs(): object {
  return swaggerJSDoc(utilsOptions);
}
