import rateLimit from 'express-rate-limit';
import { verifyToken, extractTokenFromHeader } from '../utils/jwt.js';
import userService from '../services/userService.js';

export const authMiddleware = async (req, res, next) => {
  try {
    // Try to get token from Authorization header first, then from cookies
    let token = extractTokenFromHeader(req.headers.authorization);

    if (!token && req.cookies?.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = verifyToken(token);
    const user = await userService.getUserById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Create new request object to avoid race condition
    const authenticatedReq = { ...req, user };
    Object.setPrototypeOf(authenticatedReq, Object.getPrototypeOf(req));

    // Replace the original req parameter
    Object.assign(req, authenticatedReq);
    next();
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRoles = Array.isArray(req.user.role)
      ? req.user.role
      : [req.user.role];
    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    const hasRequiredRole = requiredRoles.some((role) =>
      userRoles.includes(role),
    );

    if (!hasRequiredRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many login attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many API requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
