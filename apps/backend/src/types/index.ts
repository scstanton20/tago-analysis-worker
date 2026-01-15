/**
 * Backend-specific TypeScript types.
 *
 * These types are used only in the backend and depend on Express/Pino,
 * so they are NOT in the shared @tago-analysis-worker/types package.
 *
 * @example
 * ```typescript
 * import type { RequestWithLogger, AuthenticatedRequest } from '../types/index.ts';
 * ```
 */

// Request types
export type { RequestWithLogger } from './request.ts';

// Auth types
export type {
  AuthUser,
  AuthSession,
  AuthenticatedUser,
  AuthenticatingRequest,
  AuthenticatedRequest,
} from './auth.ts';

// Error and validation types
export type {
  AppError,
  ValidationSchema,
  ValidationErrorDetail,
} from './errors.ts';
