import fs from 'fs/promises';
import path from 'path';
import argon2 from 'argon2';
import { encrypt, decrypt } from '../utils/cryptoUtils.js';
import config from '../config/default.js';

const USERS_FILE = path.join(config.storage.base, 'users.json.enc');

// Argon2id configuration
const argon2Config = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16, // 64 MB
  timeCost: 2, // 2 iterations
  parallelism: 3, // 3 threads
  salt_length: 16,
  key_length: 32,
};

/**
 * User service for managing user authentication, permissions, and WebAuthn credentials
 * Handles encrypted storage of user data and provides RBAC functionality
 */
class UserService {
  /**
   * Create a new UserService instance
   */
  constructor() {
    this.users = null;
    this.userActivity = new Map(); // Track user activity for session validation
  }

  /**
   * Load users from encrypted storage file
   * Creates default admin user if no users exist
   * @returns {Promise<void>}
   * @throws {Error} If storage file is corrupted or unreadable
   */
  async loadUsers() {
    try {
      // Ensure storage directory exists
      await fs.mkdir(config.storage.base, { recursive: true });

      const encryptedData = await fs.readFile(USERS_FILE, 'utf8');
      const decryptedData = decrypt(encryptedData);
      this.users = JSON.parse(decryptedData);
      console.log(
        `Loaded ${Object.keys(this.users).length} users from storage`,
      );

      // Migrate existing admin users to have new permissions
      await this.migrateAdminPermissions();
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create default admin user
        console.log('Users file does not exist, creating default admin user');
        this.users = {};
        await this.createDefaultUser();
      } else {
        // Handle decryption errors (corrupted file, wrong key, etc.)
        console.error('Error loading users file:', error.message);
        if (
          error.message.includes('Authentication failed') ||
          error.message.includes('Invalid encrypted data')
        ) {
          console.warn(
            'Users file appears corrupted or encrypted with different key. Creating new users file.',
          );
          this.users = {};
          await this.createDefaultUser();
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Save users to encrypted storage file
   * @returns {Promise<void>}
   * @throws {Error} If unable to write to storage file
   */
  async saveUsers() {
    const userData = JSON.stringify(this.users, null, 2);
    const encryptedData = encrypt(userData);
    await fs.writeFile(USERS_FILE, encryptedData, 'utf8');
  }

  /**
   * Migrate admin users to ensure they have all required permissions
   * @returns {Promise<void>}
   */
  async migrateAdminPermissions() {
    // Migration: Ensure admin users have all current permissions
    let hasChanges = false;
    const requiredAdminActions = [
      'view_analyses',
      'run_analyses',
      'edit_analyses',
      'delete_analyses',
      'upload_analyses',
      'download_analyses',
      'manage_users',
      'manage_departments',
    ];

    Object.keys(this.users).forEach((username) => {
      const user = this.users[username];
      if (user.role === 'admin') {
        // Check if admin user is missing any required permissions
        const currentActions = user.permissions?.actions || [];
        const missingActions = requiredAdminActions.filter(
          (action) => !currentActions.includes(action),
        );

        if (missingActions.length > 0) {
          console.log(
            `Migrating admin user ${username}: adding permissions [${missingActions.join(', ')}]`,
          );
          user.permissions = {
            departments: [], // Admins have access to all departments
            actions: requiredAdminActions,
          };
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      await this.saveUsers();
      console.log('Admin user permissions migration completed');
    }
  }

  /**
   * Create default admin user if no users exist
   * @returns {Promise<void>}
   */
  async createDefaultUser() {
    // Only create default user if no users exist
    if (Object.keys(this.users).length > 0) {
      return;
    }

    const defaultUsername = 'admin';
    const defaultPassword = 'admin123'; // This should be changed on first login
    const hashedPassword = await argon2.hash(defaultPassword, argon2Config);

    this.users[defaultUsername] = {
      id: '1',
      username: defaultUsername,
      password: hashedPassword,
      email: 'admin@localhost',
      role: 'admin',
      permissions: {
        departments: [], // Admins have access to all departments
        actions: [
          'view_analyses',
          'run_analyses',
          'edit_analyses',
          'delete_analyses',
          'upload_analyses',
          'download_analyses',
          'manage_users',
          'manage_departments',
        ],
      },
      createdAt: new Date().toISOString(),
      mustChangePassword: true,
    };

    await this.saveUsers();
    console.log(
      'Default admin user created. Username: admin, Password: admin123',
    );
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @param {string} userData.username - Username
   * @param {string} userData.password - Password
   * @param {string} userData.email - Email
   * @param {string} [userData.role='user'] - User role
   * @param {string[]} [userData.departments=[]] - Department permissions
   * @param {string[]} [userData.actions=['view_analyses']] - Action permissions
   * @param {boolean} [userData.mustChangePassword=true] - Whether user must change password
   * @returns {Promise<Object>} Created user data without password
   * @throws {Error} If user already exists
   */
  async createUser(userData) {
    if (!this.users) await this.loadUsers();

    const {
      username,
      password,
      email,
      role = 'user',
      departments = [],
      actions = ['view_analyses'], // Default: can see running analyses but not source code
      mustChangePassword = true,
    } = userData;

    if (this.users[username]) {
      throw new Error('User already exists');
    }

    const hashedPassword = await argon2.hash(password, argon2Config);
    const userId = Date.now().toString();

    this.users[username] = {
      id: userId,
      username,
      password: hashedPassword,
      email,
      role,
      permissions: {
        departments: Array.isArray(departments) ? departments : [],
        actions: Array.isArray(actions) ? actions : ['view_analyses'], // Default: basic viewing only
      },
      createdAt: new Date().toISOString(),
      mustChangePassword,
    };

    await this.saveUsers();

    // Return user without password
    const { password: _, ...userWithoutPassword } = this.users[username];
    return userWithoutPassword;
  }

  /**
   * Validate user credentials
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object|null>} User data without password if valid, null if invalid
   */
  async validateUser(username, password) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user) return null;

    const isValid = await argon2.verify(user.password, password);
    if (!isValid) return null;

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Update user data
   * @param {string} username - Username of user to update
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated user data without password
   * @throws {Error} If user not found or username already exists
   */
  async updateUser(username, updates) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user) throw new Error('User not found');

    if (updates.password) {
      const hashedPassword = await argon2.hash(updates.password, argon2Config);
      updates = {
        ...updates,
        password: hashedPassword,
        mustChangePassword: false,
      };
    }

    // Handle username change
    const newUsername = updates.username;
    if (newUsername && newUsername !== username) {
      // Check if new username already exists
      if (this.users[newUsername]) {
        throw new Error('Username already exists');
      }

      // Update the user object
      Object.assign(user, updates);

      // Move user to new key and delete old key
      this.users[newUsername] = user;
      delete this.users[username];
    } else {
      Object.assign(user, updates);
    }

    await this.saveUsers();

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Delete a user
   * @param {string} username - Username of user to delete
   * @returns {Promise<void>}
   * @throws {Error} If user not found
   */
  async deleteUser(username) {
    if (!this.users) await this.loadUsers();

    if (!this.users[username]) {
      throw new Error('User not found');
    }

    delete this.users[username];
    await this.saveUsers();
  }

  /**
   * Get all users
   * @returns {Promise<Object[]>} Array of all users without passwords
   */
  async getAllUsers() {
    if (!this.users) await this.loadUsers();

    return Object.values(this.users).map((user) => {
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User data without password or null if not found
   */
  async getUserById(userId) {
    if (!this.users) await this.loadUsers();

    const user = Object.values(this.users).find((u) => u.id === userId);
    if (!user) return null;

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Get user by username
   * @param {string} username - Username
   * @returns {Promise<Object|null>} User data without password or null if not found
   */
  async getUserByUsername(username) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user) return null;

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Check if user has a specific permission
   * @param {string} userId - User ID
   * @param {string} action - Action to check permission for
   * @returns {Promise<boolean>} True if user has permission
   */
  async userHasPermission(userId, action) {
    if (!this.users) await this.loadUsers();

    const user = Object.values(this.users).find((u) => u.id === userId);
    if (!user) return false;

    // Admins have all permissions
    if (user.role === 'admin') return true;

    // Check if user has specific action permission
    return user.permissions?.actions?.includes(action) || false;
  }

  /**
   * Check if user has access to a specific department
   * @param {string} userId - User ID
   * @param {string} departmentId - Department ID
   * @returns {Promise<boolean>} True if user has access
   */
  async userHasDepartmentAccess(userId, departmentId) {
    if (!this.users) await this.loadUsers();

    const user = Object.values(this.users).find((u) => u.id === userId);
    if (!user) return false;

    // Admins have access to all departments
    if (user.role === 'admin') return true;

    // Check if user has access to specific department
    return user.permissions?.departments?.includes(departmentId) || false;
  }

  /**
   * Get user's permissions
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User permissions object or null if user not found
   */
  async getUserPermissions(userId) {
    if (!this.users) await this.loadUsers();

    const user = Object.values(this.users).find((u) => u.id === userId);
    if (!user) return null;

    if (user.role === 'admin') {
      return {
        departments: [], // Empty array means all departments for admins
        actions: [
          'view_analyses',
          'run_analyses',
          'edit_analyses',
          'delete_analyses',
          'upload_analyses',
          'download_analyses',
          'manage_users',
          'manage_departments',
        ],
        isAdmin: true,
      };
    }

    return {
      departments: user.permissions?.departments || [],
      actions: user.permissions?.actions || [],
      isAdmin: false,
    };
  }

  /**
   * Store WebAuthn challenge for user
   * @param {string} username - Username
   * @param {Object} challengeData - Challenge data
   * @param {string} challengeData.challenge - Challenge string
   * @param {string} challengeData.type - Challenge type ('registration' or 'authentication')
   * @param {number} challengeData.timestamp - Challenge timestamp
   * @returns {Promise<void>}
   * @throws {Error} If user not found
   */
  async storeWebAuthnChallenge(username, challengeData) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user) throw new Error('User not found');

    if (!user.webauthn) {
      user.webauthn = {};
    }

    user.webauthn.currentChallenge = challengeData;
    await this.saveUsers();
  }

  /**
   * Get WebAuthn challenge for user
   * @param {string} username - Username
   * @returns {Promise<Object|null>} Challenge data or null if not found/expired
   */
  async getWebAuthnChallenge(username) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user) return null;

    const challenge = user.webauthn?.currentChallenge;

    // Check if challenge is expired (5 minutes)
    if (challenge && Date.now() - challenge.timestamp > 5 * 60 * 1000) {
      await this.clearWebAuthnChallenge(username);
      return null;
    }

    return challenge;
  }

  /**
   * Clear WebAuthn challenge for user
   * @param {string} username - Username
   * @returns {Promise<void>}
   */
  async clearWebAuthnChallenge(username) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user || !user.webauthn) return;

    delete user.webauthn.currentChallenge;
    await this.saveUsers();
  }

  /**
   * Add WebAuthn authenticator for user
   * @param {string} username - Username
   * @param {Object} authenticator - Authenticator data
   * @param {string} authenticator.credentialID - Credential ID
   * @param {string} authenticator.credentialPublicKey - Public key
   * @param {number} authenticator.counter - Signature counter
   * @param {string[]} authenticator.transports - Transport methods
   * @param {string} authenticator.name - Authenticator name
   * @param {string} authenticator.createdAt - Creation timestamp
   * @returns {Promise<void>}
   * @throws {Error} If user not found
   */
  async addWebAuthnAuthenticator(username, authenticator) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user) throw new Error('User not found');

    if (!user.webauthn) {
      user.webauthn = { authenticators: [] };
    }
    if (!user.webauthn.authenticators) {
      user.webauthn.authenticators = [];
    }

    user.webauthn.authenticators.push(authenticator);
    await this.saveUsers();
  }

  /**
   * Remove WebAuthn authenticator for user
   * @param {string} username - Username
   * @param {string} credentialId - Credential ID to remove
   * @returns {Promise<boolean>} True if authenticator was removed
   */
  async removeWebAuthnAuthenticator(username, credentialId) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user || !user.webauthn?.authenticators) return false;

    const initialLength = user.webauthn.authenticators.length;
    user.webauthn.authenticators = user.webauthn.authenticators.filter(
      (auth) => auth.credentialID !== credentialId,
    );

    if (user.webauthn.authenticators.length < initialLength) {
      await this.saveUsers();
      return true;
    }

    return false;
  }

  /**
   * Update WebAuthn authenticator counter
   * @param {string} username - Username
   * @param {string} credentialId - Credential ID
   * @param {number} newCounter - New counter value
   * @returns {Promise<boolean>} True if counter was updated
   */
  async updateWebAuthnCounter(username, credentialId, newCounter) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user || !user.webauthn?.authenticators) return false;

    const authenticator = user.webauthn.authenticators.find(
      (auth) => auth.credentialID === credentialId,
    );

    if (authenticator) {
      authenticator.counter = Number(newCounter) || 0; // Ensure counter is a number
      await this.saveUsers();
      return true;
    }

    return false;
  }

  /**
   * Get user by WebAuthn credential ID
   * @param {string} credentialId - Credential ID
   * @returns {Promise<Object|null>} User data without password or null if not found
   */
  async getUserByCredentialID(credentialId) {
    if (!this.users) await this.loadUsers();

    for (const user of Object.values(this.users)) {
      if (user.webauthn?.authenticators) {
        const hasCredential = user.webauthn.authenticators.some(
          (auth) => auth.credentialID === credentialId,
        );
        if (hasCredential) {
          const { password: _, ...userWithoutPassword } = user;
          return userWithoutPassword;
        }
      }
    }

    return null;
  }

  /**
   * Update user activity tracking for session validation
   * @param {string} userId - User ID
   * @param {Object} activityData - Activity data (lastTokenRefresh, lastActivity, etc.)
   * @returns {Promise<void>}
   */
  async updateUserActivity(userId, activityData) {
    try {
      await this.loadUsers();

      if (!this.users[userId]) {
        throw new Error('User not found');
      }

      // Update in-memory activity tracking
      const existing = this.userActivity.get(userId) || {};
      this.userActivity.set(userId, {
        ...existing,
        ...activityData,
        updatedAt: Date.now(),
      });

      // Also update user record with essential activity data
      this.users[userId] = {
        ...this.users[userId],
        lastTokenRefresh:
          activityData.lastTokenRefresh || this.users[userId].lastTokenRefresh,
        lastActivity:
          activityData.lastActivity || this.users[userId].lastActivity,
      };

      await this.saveUsers();
    } catch (error) {
      console.error('Failed to update user activity:', error);
      throw error;
    }
  }

  /**
   * Get user activity data for session validation
   * @param {string} userId - User ID
   * @returns {Object|null} Activity data or null if not found
   */
  getUserActivity(userId) {
    return this.userActivity.get(userId) || null;
  }

  /**
   * Validate user session based on activity patterns
   * @param {string} userId - User ID
   * @param {Object} sessionData - Current session data
   * @returns {boolean} True if session is valid
   */
  validateUserSession(userId, sessionData = {}) {
    try {
      const activity = this.getUserActivity(userId);
      const user = this.users?.[userId];

      if (!activity || !user) {
        return false;
      }

      const now = Date.now();
      const maxInactivity = 15 * 60 * 1000; // 15 minutes
      const lastActivity = activity.lastActivity || 0;

      // Check if session has been inactive too long
      if (now - lastActivity > maxInactivity) {
        console.warn(
          `Session expired for user ${userId}: inactive for ${Math.round((now - lastActivity) / 60000)} minutes`,
        );
        return false;
      }

      // Additional anomaly checks
      if (
        sessionData.userAgent &&
        activity.userAgent &&
        sessionData.userAgent !== activity.userAgent
      ) {
        console.warn(`User agent change detected for user ${userId}`);
        // Don't automatically invalidate - user agent changes can be legitimate
      }

      if (sessionData.ip && activity.ip && sessionData.ip !== activity.ip) {
        console.warn(
          `IP address change detected for user ${userId}: ${activity.ip} -> ${sessionData.ip}`,
        );
        // Don't automatically invalidate - IP changes can be legitimate (mobile, VPN)
      }

      return true;
    } catch (error) {
      console.error('Error validating user session:', error);
      return false;
    }
  }

  /**
   * Clean up expired user activity data
   * @returns {Promise<void>}
   */
  async cleanupExpiredActivity() {
    try {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      for (const [userId, activity] of this.userActivity.entries()) {
        if (now - (activity.updatedAt || 0) > maxAge) {
          this.userActivity.delete(userId);
        }
      }

      console.log(
        `Cleaned up expired activity data, ${this.userActivity.size} active sessions remaining`,
      );
    } catch (error) {
      console.error('Error cleaning up expired activity:', error);
    }
  }
}

export default new UserService();
