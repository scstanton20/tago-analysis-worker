/**
 * OpenAPI Generator
 *
 * Generates OpenAPI 3.1 specification from Zod schemas.
 * Uses the V31 generator for modern OpenAPI features including:
 * - Type arrays for nullables: type: ['string', 'null']
 * - Better JSON Schema alignment
 * - Improved discriminator support
 */

import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi';
import * as schemas from './schemas.js';

// Create a registry for all schemas
const registry = new OpenAPIRegistry();

// ============================================================================
// REGISTER ALL SCHEMAS
// ============================================================================

// Error responses
registry.register('Error', schemas.errorResponseSchema);
registry.register('ValidationError', schemas.validationErrorResponseSchema);
registry.register('SuccessResponse', schemas.successResponseSchema);

// User schemas
registry.register('User', schemas.userSchema);
registry.register('LoginRequest', schemas.loginRequestSchema);
registry.register('LoginResponse', schemas.loginResponseSchema);

// Team schemas
registry.register('Team', schemas.teamSchema);
registry.register('TeamRequest', schemas.teamRequestSchema);

// Folder & tree structure schemas
registry.register('TreeAnalysisItem', schemas.treeAnalysisItemSchema);
registry.register('Folder', schemas.folderSchema);
registry.register('TeamStructure', schemas.teamStructureSchema);
registry.register('MoveItemRequest', schemas.moveItemRequestSchema);

// Analysis schemas
registry.register('Analysis', schemas.analysisSchema);
registry.register(
  'AnalysisEnvironment',
  schemas.analysisEnvironmentNamedSchema,
);
registry.register('AnalysisVersion', schemas.analysisVersionSchema);
registry.register(
  'AnalysisVersionsResponse',
  schemas.analysisVersionsResponseSchema,
);
registry.register('LogEntry', schemas.logEntrySchema);
registry.register('AnalysisLogs', schemas.analysisLogsSchema);

// User team membership schemas
registry.register('UserTeamMembership', schemas.userTeamMembershipSchema);
registry.register('TeamAssignment', schemas.teamAssignmentSchema);

// Session schemas
registry.register('Session', schemas.sessionSchema);

// DNS cache schemas
registry.register('DNSConfig', schemas.dnsConfigSchema);
registry.register('DNSStats', schemas.dnsStatsSchema);
registry.register('DNSCacheEntry', schemas.dnsCacheEntrySchema);
registry.register('DNSConfigResponse', schemas.dnsConfigResponseSchema);
registry.register(
  'DNSConfigUpdateRequest',
  schemas.dnsConfigUpdateRequestSchema,
);
registry.register(
  'DNSCacheEntriesResponse',
  schemas.dnsCacheEntriesResponseSchema,
);

// ============================================================================
// GENERATE OPENAPI SPEC
// ============================================================================

/**
 * Generate OpenAPI schemas object for use in swagger.ts
 *
 * @returns OpenAPI 3.1 components.schemas object
 */
export function generateOpenAPISchemas(): Record<string, unknown> {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  const spec = generator.generateComponents();
  return spec.components?.schemas ?? {};
}

/**
 * Generate full OpenAPI document (for standalone use)
 *
 * @param config - OpenAPI document configuration
 * @returns Complete OpenAPI 3.1 specification
 */
export function generateOpenAPIDocument(config: {
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
}): Record<string, unknown> {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: config.info,
    ...(config.servers && { servers: config.servers }),
  }) as unknown as Record<string, unknown>;
}

// Export registry for advanced use cases
export { registry };

// Export schemas for direct access
export * from './schemas.js';
