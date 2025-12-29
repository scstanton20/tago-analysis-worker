/**
 * Auth Session Types
 *
 * These types describe the session structure from Better Auth.
 * The actual session type is inferred from Better Auth's $Infer.Session
 * in the backend auth.ts file.
 *
 * These interfaces serve as documentation and for frontend type usage
 * where we don't have direct access to the Better Auth instance.
 */

import type { OrganizationRole } from '../domain/user.js';

/** Active organization in session */
export interface SessionOrganization {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
  isOwner: boolean;
}

/**
 * User data included in session
 *
 * This matches Better Auth's user structure with our custom fields:
 * - role: from additionalFields config
 * - isOwner: injected by customSession plugin
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  username?: string;
  image?: string | null;
  role: string;
  isOwner: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  requiresPasswordChange?: boolean;
}

/**
 * Session data from Better Auth
 *
 * This matches Better Auth's session structure with organization plugin fields.
 * The actual type is inferred from `typeof auth.$Infer.Session` in the backend.
 */
export interface Session {
  /** Session ID */
  id: string;
  /** Session token (for API calls) */
  token: string;
  /** User ID */
  userId: string;
  /** Session expiration */
  expiresAt: Date;
  /** IP address of session creation */
  ipAddress?: string;
  /** User agent string */
  userAgent?: string;
  /** Active organization ID (from organization plugin) */
  activeOrganizationId?: string;
  /** Session creation time */
  createdAt: Date;
  /** Session update time */
  updatedAt: Date;
}

/**
 * User's team membership from customSession plugin
 *
 * Injected into the session by the customSession plugin in auth.ts
 */
export interface SessionTeam {
  id: string;
  name: string;
  permissions: string[];
}

/**
 * Full session response from Better Auth API
 *
 * This is what /api/auth/get-session returns.
 * Includes session, user, and teams from customSession plugin.
 */
export interface FullSession {
  session: Session;
  user: SessionUser;
  teams: SessionTeam[];
}

/**
 * Session token payload (decoded JWT)
 *
 * Used for token validation and parsing.
 */
export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
  sessionId: string;
  organizationId?: string;
}
