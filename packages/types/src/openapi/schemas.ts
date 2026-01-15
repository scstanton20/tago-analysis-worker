/**
 * OpenAPI Schemas
 *
 * Zod schemas with OpenAPI metadata for automatic Swagger generation.
 * These schemas serve as the single source of truth for:
 * - TypeScript types (via z.infer)
 * - Runtime validation (via Zod)
 * - API documentation (via OpenAPI)
 */

import { z } from './setup.js';

// ============================================================================
// ERROR RESPONSES
// ============================================================================

/** Standard API error response */
export const errorResponseSchema = z
  .object({
    error: z.string().openapi({ description: 'Error message' }),
    stack: z.string().optional().openapi({
      description: 'Error stack trace (only included in development mode)',
    }),
  })
  .openapi('Error');

/** Validation error detail */
export const validationErrorDetailSchema = z
  .object({
    path: z.string().openapi({ description: 'Path to the invalid field' }),
    message: z.string().openapi({ description: 'Validation error message' }),
    code: z.string().openapi({ description: 'Zod error code' }),
  })
  .openapi('ValidationErrorDetail');

/** Validation error response */
export const validationErrorResponseSchema = z
  .object({
    error: z
      .string()
      .openapi({ description: 'Error message', example: 'Validation error' }),
    code: z
      .enum([
        'INVALID_REQUEST_BODY',
        'INVALID_QUERY_PARAMETERS',
        'INVALID_ROUTE_PARAMETERS',
        'INVALID_FILENAME',
      ])
      .openapi({
        description: 'Validation error code',
        example: 'INVALID_REQUEST_BODY',
      }),
    details: z
      .array(validationErrorDetailSchema)
      .openapi({ description: 'Validation error details' }),
  })
  .openapi('ValidationError');

/** Success response */
export const successResponseSchema = z
  .object({
    success: z.literal(true).openapi({ example: true }),
    message: z.string().optional().openapi({ description: 'Success message' }),
  })
  .openapi('SuccessResponse');

// ============================================================================
// USER SCHEMAS
// ============================================================================

/** User role enum */
export const userRoleSchema = z
  .enum(['admin', 'user'])
  .openapi({ description: 'User role' });

/** User schema */
export const userSchema = z
  .object({
    id: z.string().openapi({ description: 'Unique user identifier' }),
    username: z.string().optional().openapi({ description: 'Username' }),
    email: z.string().email().openapi({
      description: 'User email address',
      format: 'email',
    }),
    name: z.string().openapi({ description: 'Display name' }),
    role: userRoleSchema,
    image: z.string().nullable().optional().openapi({
      description: 'Profile image URL',
    }),
    requiresPasswordChange: z.boolean().optional().openapi({
      description: 'Whether user must change password on next login',
    }),
  })
  .openapi('User');

/** Login request */
export const loginRequestSchema = z
  .object({
    email: z.string().openapi({ description: 'Email address' }),
    password: z
      .string()
      .min(1)
      .openapi({ description: 'User password', minLength: 1 }),
    rememberMe: z.boolean().optional().openapi({
      description: 'Keep session active longer',
    }),
  })
  .openapi('LoginRequest');

/** Login response */
export const loginResponseSchema = z
  .object({
    message: z.string().openapi({ description: 'Success message' }),
    user: userSchema,
  })
  .openapi('LoginResponse');

// ============================================================================
// TEAM SCHEMAS
// ============================================================================

/** Team schema */
export const teamSchema = z
  .object({
    id: z.string().openapi({ description: 'Unique team identifier' }),
    name: z.string().openapi({ description: 'Team name' }),
    color: z.string().openapi({
      description: 'Team color (hex format)',
      example: '#3b82f6',
    }),
    orderIndex: z.number().openapi({ description: 'Display order' }),
    isSystem: z.boolean().optional().openapi({
      description: 'Whether this is a system team',
    }),
  })
  .openapi('Team');

/** Team request (create/update) */
export const teamRequestSchema = z
  .object({
    name: z.string().openapi({ description: 'Team name' }),
    color: z.string().optional().openapi({
      description: 'Team color (hex format)',
      example: '#3b82f6',
    }),
  })
  .openapi('TeamRequest');

// ============================================================================
// FOLDER & TREE STRUCTURE SCHEMAS
// ============================================================================

/** Tree analysis item */
export const treeAnalysisItemSchema = z
  .object({
    id: z.string().openapi({
      description: 'Analysis ID - references an analysis in the system',
    }),
    type: z.literal('analysis').openapi({ description: 'Item type' }),
  })
  .openapi('TreeAnalysisItem');

/** Folder schema (recursive) */
export const folderSchema: z.ZodType<{
  id: string;
  name: string;
  type: 'folder';
  expanded?: boolean;
  items: Array<
    | { id: string; type: 'analysis' }
    | {
        id: string;
        name: string;
        type: 'folder';
        expanded?: boolean;
        items: unknown[];
      }
  >;
}> = z.lazy(() =>
  z
    .object({
      id: z
        .string()
        .openapi({ description: 'Unique folder identifier (UUID)' }),
      name: z.string().openapi({ description: 'Folder name' }),
      type: z.literal('folder').openapi({ description: 'Item type' }),
      expanded: z.boolean().optional().openapi({
        description: 'Whether folder is expanded in UI',
      }),
      items: z
        .array(z.union([folderSchema, treeAnalysisItemSchema]))
        .openapi({ description: 'Child items (folders and analyses)' }),
    })
    .openapi('Folder'),
);

/** Team structure */
export const teamStructureSchema = z
  .object({
    items: z
      .array(z.union([folderSchema, treeAnalysisItemSchema]))
      .openapi({ description: 'Root-level items in team structure' }),
  })
  .openapi('TeamStructure');

/** Move item request */
export const moveItemRequestSchema = z
  .object({
    itemId: z.string().openapi({ description: 'ID of item to move' }),
    targetParentId: z.string().nullable().openapi({
      description: 'Target parent folder ID (null for root level)',
    }),
    targetIndex: z.number().openapi({
      description: 'Index position in target location',
    }),
  })
  .openapi('MoveItemRequest');

// ============================================================================
// ANALYSIS SCHEMAS
// ============================================================================

/** Analysis status enum */
export const analysisStatusSchema = z
  .enum(['stopped', 'running', 'error'])
  .openapi({ description: 'Current analysis status' });

/** Analysis schema */
export const analysisSchema = z
  .object({
    id: z.string().openapi({ description: 'Unique analysis identifier' }),
    name: z.string().openapi({ description: 'Analysis name' }),
    status: analysisStatusSchema,
    teamId: z.string().nullable().openapi({
      description: 'Team ID this analysis belongs to',
    }),
    enabled: z
      .boolean()
      .openapi({ description: 'Whether analysis is enabled' }),
    lastStartTime: z.string().nullable().openapi({
      description: 'Last execution timestamp',
      format: 'date-time',
    }),
    size: z.string().optional().openapi({
      description: 'Human-readable file size',
    }),
  })
  .openapi('Analysis');

/** Analysis environment variables */
export const analysisEnvironmentSchema = z
  .record(z.string(), z.string())
  .openapi({
    description: 'Environment variables as key-value pairs',
    example: { API_TOKEN: '', DEBUG: 'true' },
  });

// Register as named schema
export const analysisEnvironmentNamedSchema = analysisEnvironmentSchema.openapi(
  'AnalysisEnvironment',
);

/** Analysis version */
export const analysisVersionSchema = z
  .object({
    version: z.number().int().openapi({ description: 'Version number' }),
    timestamp: z.string().openapi({
      description: 'When this version was created',
      format: 'date-time',
    }),
    size: z.number().int().openapi({ description: 'File size in bytes' }),
  })
  .openapi('AnalysisVersion');

/** Analysis versions response */
export const analysisVersionsResponseSchema = z
  .object({
    versions: z.array(analysisVersionSchema),
    nextVersionNumber: z.number().int().openapi({
      description: 'Next version number that will be used',
    }),
  })
  .openapi('AnalysisVersionsResponse');

/** Log entry */
export const logEntrySchema = z
  .object({
    timestamp: z.string().openapi({ description: 'Log entry timestamp' }),
    level: z.enum(['log', 'info', 'warn', 'error', 'debug']).openapi({
      description: 'Log level',
    }),
    message: z.string().openapi({ description: 'Log message' }),
  })
  .openapi('LogEntry');

/** Analysis logs response */
export const analysisLogsSchema = z
  .object({
    logs: z.array(logEntrySchema),
    pagination: z.object({
      page: z.number().openapi({ description: 'Current page number' }),
      limit: z.number().openapi({ description: 'Number of entries per page' }),
      total: z.number().openapi({ description: 'Total number of log entries' }),
    }),
  })
  .openapi('AnalysisLogs');

// ============================================================================
// USER TEAM MEMBERSHIP SCHEMAS
// ============================================================================

/** Team permission enum */
export const teamPermissionSchema = z
  .enum([
    'upload_analyses',
    'view_analyses',
    'run_analyses',
    'edit_analyses',
    'delete_analyses',
    'download_analyses',
  ])
  .openapi({ description: 'Team permission type' });

/** User team membership */
export const userTeamMembershipSchema = z
  .object({
    id: z.string().openapi({ description: 'Team ID' }),
    name: z.string().openapi({ description: 'Team name' }),
    role: z.string().default('member').openapi({
      description: 'User role in team',
    }),
    permissions: z.array(teamPermissionSchema).openapi({
      description: 'Array of permission strings',
      example: ['upload_analyses', 'view_analyses', 'run_analyses'],
    }),
  })
  .openapi('UserTeamMembership');

/** Team assignment */
export const teamAssignmentSchema = z
  .object({
    teamId: z.string().openapi({ description: 'Team ID to assign user to' }),
    permissions: z.array(teamPermissionSchema).openapi({
      description: 'Array of permissions to grant',
      example: ['view_analyses', 'run_analyses'],
    }),
  })
  .openapi('TeamAssignment');

// ============================================================================
// SESSION SCHEMAS
// ============================================================================

/** Session schema */
export const sessionSchema = z
  .object({
    user: userSchema,
    session: z.object({
      id: z.string().openapi({ description: 'Session ID' }),
      token: z.string().openapi({ description: 'Session token' }),
      userId: z.string().openapi({
        description: 'User ID associated with session',
      }),
      expiresAt: z.string().openapi({
        description: 'Session expiration timestamp',
        format: 'date-time',
      }),
      ipAddress: z.string().optional().openapi({
        description: 'IP address of the session',
      }),
      userAgent: z.string().optional().openapi({
        description: 'User agent string',
      }),
    }),
  })
  .openapi('Session');

// ============================================================================
// DNS CACHE SCHEMAS
// ============================================================================

/** DNS config */
export const dnsConfigSchema = z
  .object({
    enabled: z.boolean().openapi({
      description: 'Whether DNS caching is enabled',
      example: true,
    }),
    ttl: z.number().min(1000).max(86400000).openapi({
      description: 'Time to live for cached entries in milliseconds',
      minimum: 1000,
      maximum: 86400000,
      example: 300000,
    }),
    maxEntries: z.number().min(10).max(10000).openapi({
      description: 'Maximum number of entries to cache',
      minimum: 10,
      maximum: 10000,
      example: 1000,
    }),
  })
  .openapi('DNSConfig');

/** DNS stats */
export const dnsStatsSchema = z
  .object({
    hits: z.number().openapi({
      description: 'Number of cache hits',
      example: 150,
    }),
    misses: z.number().openapi({
      description: 'Number of cache misses',
      example: 50,
    }),
    errors: z.number().openapi({
      description: 'Number of DNS resolution errors',
      example: 2,
    }),
    evictions: z.number().openapi({
      description: 'Number of entries evicted from cache',
      example: 5,
    }),
    cacheSize: z.number().openapi({
      description: 'Current number of entries in cache',
      example: 123,
    }),
    hitRate: z.string().openapi({
      description: 'Cache hit rate as a percentage',
      example: '75.00',
    }),
  })
  .openapi('DNSStats');

/** DNS cache entry */
export const dnsCacheEntrySchema = z
  .object({
    key: z.string().openapi({
      description: 'Cache key (hostname:family or resolve4:hostname, etc.)',
      example: 'google.com:4',
    }),
    data: z
      .object({})
      .passthrough()
      .openapi({
        description: 'Cached DNS resolution data',
        example: { address: '142.250.191.78', family: 4 },
      }),
    timestamp: z.number().openapi({
      description: 'Timestamp when entry was cached (Unix timestamp)',
      example: 1704067200000,
    }),
    age: z.number().openapi({
      description: 'Age of cache entry in milliseconds',
      example: 120000,
    }),
    remainingTTL: z.number().openapi({
      description: 'Remaining time to live in milliseconds',
      example: 180000,
    }),
    expired: z.boolean().openapi({
      description: 'Whether the cache entry has expired',
      example: false,
    }),
    source: z.string().optional().openapi({
      description: 'Source of the cache entry',
      example: 'shared',
    }),
  })
  .openapi('DNSCacheEntry');

/** DNS config response */
export const dnsConfigResponseSchema = z
  .object({
    config: dnsConfigSchema,
    stats: z.object({
      cacheSize: z.number(),
      hits: z.number(),
      misses: z.number(),
      hitRate: z.number(),
    }),
  })
  .openapi('DNSConfigResponse');

/** DNS config update request */
export const dnsConfigUpdateRequestSchema = z
  .object({
    enabled: z.boolean().optional().openapi({
      description: 'Whether to enable DNS caching',
      example: true,
    }),
    ttl: z.number().min(1000).max(86400000).optional().openapi({
      description: 'Time to live for cached entries in milliseconds',
      minimum: 1000,
      maximum: 86400000,
      example: 300000,
    }),
    maxEntries: z.number().min(10).max(10000).optional().openapi({
      description: 'Maximum number of entries to cache',
      minimum: 10,
      maximum: 10000,
      example: 1000,
    }),
  })
  .openapi('DNSConfigUpdateRequest');

/** DNS cache entries response */
export const dnsCacheEntriesResponseSchema = z
  .object({
    entries: z.array(dnsCacheEntrySchema).openapi({
      description: 'Array of DNS cache entries',
    }),
    total: z.number().openapi({
      description: 'Total number of cache entries',
      example: 123,
    }),
  })
  .openapi('DNSCacheEntriesResponse');

// ============================================================================
// EXPORT INFERRED TYPES
// ============================================================================

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ValidationErrorResponse = z.infer<
  typeof validationErrorResponseSchema
>;
export type SuccessResponse = z.infer<typeof successResponseSchema>;
export type User = z.infer<typeof userSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type Team = z.infer<typeof teamSchema>;
export type TeamRequest = z.infer<typeof teamRequestSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type TreeAnalysisItem = z.infer<typeof treeAnalysisItemSchema>;
export type TeamStructure = z.infer<typeof teamStructureSchema>;
export type MoveItemRequest = z.infer<typeof moveItemRequestSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type AnalysisEnvironment = z.infer<typeof analysisEnvironmentSchema>;
export type AnalysisVersion = z.infer<typeof analysisVersionSchema>;
export type AnalysisVersionsResponse = z.infer<
  typeof analysisVersionsResponseSchema
>;
export type LogEntry = z.infer<typeof logEntrySchema>;
export type AnalysisLogs = z.infer<typeof analysisLogsSchema>;
export type UserTeamMembership = z.infer<typeof userTeamMembershipSchema>;
export type TeamAssignment = z.infer<typeof teamAssignmentSchema>;
export type SessionResponse = z.infer<typeof sessionSchema>;
export type DNSConfig = z.infer<typeof dnsConfigSchema>;
export type DNSStats = z.infer<typeof dnsStatsSchema>;
export type DNSCacheEntry = z.infer<typeof dnsCacheEntrySchema>;
export type DNSConfigResponse = z.infer<typeof dnsConfigResponseSchema>;
export type DNSConfigUpdateRequest = z.infer<
  typeof dnsConfigUpdateRequestSchema
>;
export type DNSCacheEntriesResponse = z.infer<
  typeof dnsCacheEntriesResponseSchema
>;
