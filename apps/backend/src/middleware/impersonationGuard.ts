import type { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth, type Session } from '../lib/auth.ts';
import { createChildLogger } from '../utils/logging/logger.ts';

const logger = createChildLogger('impersonation-guard');

/** Session with admin plugin's impersonatedBy field */
type SessionWithImpersonation = Session['session'] & {
  impersonatedBy?: string;
};

/**
 * Paths that should be blocked during impersonation
 * These are profile-related operations that admins should not
 * perform on behalf of impersonated users
 */
const BLOCKED_PATHS = ['/update-user', '/change-password', '/change-email'];

/**
 * Middleware to block profile operations during impersonation
 * Admins impersonating users should not be able to modify the user's profile
 */
export async function impersonationGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const path = req.path;

  if (!BLOCKED_PATHS.includes(path)) {
    next();
    return;
  }

  try {
    const result = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    const session = result?.session as SessionWithImpersonation | undefined;

    if (session?.impersonatedBy) {
      logger.warn(
        {
          path,
          userId: result?.user?.id,
          impersonatedBy: session.impersonatedBy,
        },
        'Blocked profile operation during impersonation',
      );
      res.status(403).json({
        error: 'Profile changes are not allowed while impersonating',
        code: 'IMPERSONATION_PROFILE_BLOCKED',
      });
      return;
    }
  } catch (error) {
    // If session check fails, let the request continue to Better Auth
    logger.debug({ error }, 'Session check failed in impersonation guard');
  }

  next();
}
