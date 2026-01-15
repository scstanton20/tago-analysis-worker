/**
 * Authentication types for Express middleware.
 * Consolidated from duplicate definitions in betterAuthMiddleware and controllers.
 */

import type { RequestWithLogger } from './request.ts';

/**
 * User object attached to request by auth middleware.
 * Represents the authenticated user from better-auth.
 */
export type AuthUser = {
  readonly id: string;
  readonly email?: string;
  readonly name?: string;
  readonly role?: string;
  readonly requiresPasswordChange?: boolean;
};

/**
 * Session object attached to request by auth middleware.
 * Represents the active session from better-auth.
 */
export type AuthSession = {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly activeOrganizationId?: string;
};

/**
 * Minimal authenticated user type for permission checks.
 * Used when only id and role are needed.
 */
export type AuthenticatedUser = {
  readonly id: string;
  readonly role: string;
};

/**
 * Express request during authentication process.
 * Used by auth middleware before user is validated.
 * User and session are optional since middleware sets them.
 */
export type AuthenticatingRequest = RequestWithLogger & {
  /** Authenticated user (set by auth middleware) */
  user?: AuthUser;
  /** Active session (set by auth middleware) */
  session?: AuthSession;
  /** Team ID for the current analysis operation */
  analysisTeamId?: string;
};

/**
 * Express request with authenticated user and session.
 * Used in routes that require authentication (after auth middleware).
 * Note: `user` is required since routes using this type are protected by auth middleware.
 */
export type AuthenticatedRequest = RequestWithLogger & {
  /** Authenticated user (guaranteed by auth middleware) */
  user: AuthUser;
  /** Active session */
  session?: AuthSession;
  /** Team ID for the current analysis operation */
  analysisTeamId?: string;
};
