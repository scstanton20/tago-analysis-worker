import userService from '../services/userService.js';

// Middleware to check if user has specific permission
export const requirePermission = (action) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasPermission = await userService.userHasPermission(
        req.user.id,
        action,
      );

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          required: action,
        });
      }

      next();
    } catch {
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

// Middleware to check if user has access to specific department
export const requireDepartmentAccess = (getDepartmentId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // getDepartmentId can be a function that extracts department ID from request
      const departmentId =
        typeof getDepartmentId === 'function'
          ? getDepartmentId(req)
          : getDepartmentId;

      if (!departmentId) {
        return res.status(400).json({ error: 'Department ID required' });
      }

      const hasAccess = await userService.userHasDepartmentAccess(
        req.user.id,
        departmentId,
      );

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Department access denied',
          department: departmentId,
        });
      }

      next();
    } catch {
      return res.status(500).json({ error: 'Department access check failed' });
    }
  };
};

// Middleware to attach user permissions to request
export const attachPermissions = async (req, _res, next) => {
  try {
    if (req.user) {
      const userId = req.user.id;
      const permissions = await userService.getUserPermissions(userId);
      // eslint-disable-next-line require-atomic-updates
      req.userPermissions = permissions;
    }
    next();
  } catch {
    next();
  }
};
