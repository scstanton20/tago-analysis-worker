import userService from '../services/userService.js';
import {
  generateTokens,
  invalidateToken,
  invalidateAllUserSessions,
  extractTokenFromHeader,
} from '../utils/jwt.js';
import { broadcastToUser } from '../utils/websocket.js';

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: 'Username and password are required' });
    }

    const user = await userService.validateUser(username, password);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user must change password
    if (user.mustChangePassword) {
      return res.status(403).json({
        error: 'Password change required',
        mustChangePassword: true,
        user: { username: user.username, email: user.email },
      });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    res.json({
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { username } = req.user;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: 'Current and new passwords are required' });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: 'New password must be at least 6 characters long' });
    }

    const isValidCurrent = await userService.validateUser(
      username,
      currentPassword,
    );
    if (!isValidCurrent) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const updatedUser = await userService.updateUser(username, {
      password: newPassword,
    });

    // Invalidate all other sessions for security
    const invalidatedSessions = invalidateAllUserSessions(updatedUser.id);

    // Generate new tokens after password change
    const { accessToken, refreshToken } = generateTokens(updatedUser);

    // Broadcast logout to other sessions
    broadcastToUser(updatedUser.id, {
      type: 'sessionInvalidated',
      reason: 'Password changed',
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: 'Password changed successfully',
      user: updatedUser,
      accessToken,
      refreshToken,
      invalidatedSessions: invalidatedSessions.length,
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const forceChangePassword = async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;

    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Username, current password, and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: 'New password must be at least 6 characters long' });
    }

    // Validate the current password
    const user = await userService.validateUser(username, currentPassword);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Ensure the user is required to change password
    if (!user.mustChangePassword) {
      return res.status(400).json({ error: 'Password change not required' });
    }

    const updatedUser = await userService.updateUser(username, {
      password: newPassword,
      mustChangePassword: false,
    });

    // Invalidate all other sessions for security (if any exist)
    invalidateAllUserSessions(updatedUser.id);

    // Generate tokens after successful password change
    const { accessToken, refreshToken } = generateTokens(updatedUser);

    res.json({
      message: 'Password changed successfully',
      user: updatedUser,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Force change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = async (req, res) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    const userId = req.user?.id;

    if (token) {
      invalidateToken(token);

      // Broadcast logout to all sessions of the same user
      if (userId) {
        broadcastToUser(userId, {
          type: 'sessionInvalidated',
          reason: 'User logged out from another session',
          timestamp: new Date().toISOString(),
        });
      }
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logoutAllSessions = async (req, res) => {
  try {
    const userId = req.user.id;

    // Invalidate all sessions for this user
    const invalidatedSessions = invalidateAllUserSessions(userId);

    // Broadcast logout message to all user's sessions
    broadcastToUser(userId, {
      type: 'sessionInvalidated',
      reason: 'All sessions logged out',
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: 'All sessions logged out successfully',
      invalidatedSessions: invalidatedSessions.length,
    });
  } catch (error) {
    console.error('Logout all sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProfile = async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createUser = async (req, res) => {
  try {
    const { username, email, role, departments, actions } = req.body;

    if (!username || !email) {
      return res.status(400).json({ error: 'Username and email are required' });
    }

    // Generate default password
    const defaultPassword = `temp${Math.random().toString(36).slice(2, 8)}!`;

    const user = await userService.createUser({
      username,
      password: defaultPassword,
      email,
      role: role || 'user',
      departments: departments || [],
      actions: actions || ['view_analyses'], // Default: can see running analyses, not source files
      mustChangePassword: true,
    });

    // Return the default password to admin (for one-time display)
    res.status(201).json({
      user,
      defaultPassword,
      message:
        'User created successfully. Please provide the default password to the user.',
    });
  } catch (error) {
    if (error.message === 'User already exists') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { username } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.createdAt;

    if (updates.password && updates.password.length < 6) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if trying to change role from admin to user
    if (updates.role && updates.role !== 'admin') {
      const targetUser = await userService.getUserByUsername(username);
      if (targetUser && targetUser.role === 'admin') {
        // Count total admin users
        const allUsers = await userService.getAllUsers();
        const adminCount = allUsers.filter((u) => u.role === 'admin').length;

        if (adminCount <= 1) {
          return res.status(400).json({
            error: 'Cannot change role: At least one admin user must exist',
          });
        }
      }
    }

    // Handle permissions update if included
    if (updates.departments !== undefined || updates.actions !== undefined) {
      updates.permissions = {
        departments: Array.isArray(updates.departments)
          ? updates.departments
          : [],
        actions: Array.isArray(updates.actions)
          ? updates.actions
          : ['view_analyses'], // Default: basic viewing permission
      };

      // Remove the flat department/action fields to avoid confusion
      delete updates.departments;
      delete updates.actions;
    }

    const user = await userService.updateUser(username, updates);
    res.json({ user });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { username } = req.params;

    if (username === req.user.username) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if trying to delete the last admin user
    const targetUser = await userService.getUserByUsername(username);
    if (targetUser && targetUser.role === 'admin') {
      const allUsers = await userService.getAllUsers();
      const adminCount = allUsers.filter((u) => u.role === 'admin').length;

      if (adminCount <= 1) {
        return res.status(400).json({
          error: 'Cannot delete user: At least one admin user must exist',
        });
      }
    }

    await userService.deleteUser(username);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const resetUserPassword = async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Generate new temporary password
    const newPassword = `temp${Math.random().toString(36).slice(2, 8)}!`;

    const updatedUser = await userService.updateUser(username, {
      password: newPassword,
      mustChangePassword: true,
    });

    // Invalidate all sessions for this user for security
    const invalidatedSessions = invalidateAllUserSessions(updatedUser.id);

    // Broadcast logout to user's sessions
    broadcastToUser(updatedUser.id, {
      type: 'sessionInvalidated',
      reason: 'Password reset by administrator',
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: 'Password reset successfully',
      user: updatedUser,
      newPassword,
      invalidatedSessions: invalidatedSessions.length,
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }
    console.error('Reset user password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserPermissions = async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Check if user is admin or requesting their own permissions
    if (req.user.role !== 'admin' && req.user.username !== username) {
      return res.status(403).json({
        error: 'Forbidden: You can only view your own permissions',
      });
    }

    const user = await userService.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const permissions = await userService.getUserPermissions(user.id);
    res.json({ permissions });
  } catch (error) {
    console.error('Get user permissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUserPermissions = async (req, res) => {
  try {
    const { username } = req.params;
    const { departments, actions } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const user = await userService.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't allow changing admin permissions
    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Cannot modify admin permissions' });
    }

    const updatedUser = await userService.updateUser(username, {
      permissions: {
        departments: Array.isArray(departments)
          ? departments
          : user.permissions?.departments || [],
        actions: Array.isArray(actions)
          ? actions
          : user.permissions?.actions || ['view_analyses'], // Default fallback
      },
    });

    res.json({
      message: 'User permissions updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Update user permissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAvailableDepartments = async (req, res) => {
  try {
    // Import department service dynamically to avoid circular dependency
    const { default: departmentService } = await import(
      '../services/departmentService.js'
    );
    const departments = await departmentService.getAllDepartments();

    // Convert to array format suitable for frontend
    const departmentList = Object.values(departments).map((dept) => ({
      id: dept.id,
      name: dept.name,
      description: dept.description || '',
    }));

    res.json({ departments: departmentList });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAvailableActions = async (req, res) => {
  try {
    const actions = [
      {
        id: 'view_analyses',
        name: 'View Analyses',
        description: 'Can view analysis status, logs, and source code files',
      },
      {
        id: 'run_analyses',
        name: 'Run Analyses',
        description: 'Can start and stop analyses',
      },
      {
        id: 'edit_analyses',
        name: 'Edit Analyses',
        description: 'Can modify analysis configurations',
      },
      {
        id: 'delete_analyses',
        name: 'Delete Analyses',
        description: 'Can delete analyses',
      },
      {
        id: 'upload_analyses',
        name: 'Upload Analyses',
        description: 'Can upload new analysis files',
      },
      {
        id: 'download_analyses',
        name: 'Download Analyses',
        description: 'Can download analysis files and logs',
      },
      {
        id: 'manage_departments',
        name: 'Manage Departments',
        description: 'Can create, edit, and manage departments',
      },
    ];

    res.json({ actions });
  } catch (error) {
    console.error('Get actions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
