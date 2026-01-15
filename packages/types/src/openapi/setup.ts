/**
 * OpenAPI Setup
 *
 * Extends Zod with OpenAPI capabilities using @asteasolutions/zod-to-openapi.
 * This must be imported before any schema definitions.
 */

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Extend Zod with OpenAPI methods (.openapi())
extendZodWithOpenApi(z);

// Re-export the extended z for use in schemas
export { z };
