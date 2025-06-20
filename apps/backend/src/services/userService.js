import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcrypt';
import { encrypt, decrypt } from '../utils/cryptoUtils.js';
import config from '../config/default.js';

const USERS_FILE = path.join(config.storage.base, 'users.json.enc');

class UserService {
  constructor() {
    this.users = null;
  }

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

  async saveUsers() {
    const userData = JSON.stringify(this.users, null, 2);
    const encryptedData = encrypt(userData);
    await fs.writeFile(USERS_FILE, encryptedData, 'utf8');
  }

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

  async createDefaultUser() {
    // Only create default user if no users exist
    if (Object.keys(this.users).length > 0) {
      return;
    }

    const defaultUsername = 'admin';
    const defaultPassword = 'admin123'; // This should be changed on first login
    const hashedPassword = await bcrypt.hash(defaultPassword, 12);

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

    const hashedPassword = await bcrypt.hash(password, 12);
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

  async validateUser(username, password) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return null;

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async updateUser(username, updates) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user) throw new Error('User not found');

    if (updates.password) {
      const hashedPassword = await bcrypt.hash(updates.password, 12);
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

  async deleteUser(username) {
    if (!this.users) await this.loadUsers();

    if (!this.users[username]) {
      throw new Error('User not found');
    }

    delete this.users[username];
    await this.saveUsers();
  }

  async getAllUsers() {
    if (!this.users) await this.loadUsers();

    return Object.values(this.users).map((user) => {
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  async getUserById(userId) {
    if (!this.users) await this.loadUsers();

    const user = Object.values(this.users).find((u) => u.id === userId);
    if (!user) return null;

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getUserByUsername(username) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user) return null;

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // RBAC helper methods
  async userHasPermission(userId, action) {
    if (!this.users) await this.loadUsers();

    const user = Object.values(this.users).find((u) => u.id === userId);
    if (!user) return false;

    // Admins have all permissions
    if (user.role === 'admin') return true;

    // Check if user has specific action permission
    return user.permissions?.actions?.includes(action) || false;
  }

  async userHasDepartmentAccess(userId, departmentId) {
    if (!this.users) await this.loadUsers();

    const user = Object.values(this.users).find((u) => u.id === userId);
    if (!user) return false;

    // Admins have access to all departments
    if (user.role === 'admin') return true;

    // Check if user has access to specific department
    return user.permissions?.departments?.includes(departmentId) || false;
  }

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

  // WebAuthn Methods
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

  async clearWebAuthnChallenge(username) {
    if (!this.users) await this.loadUsers();

    const user = this.users[username];
    if (!user || !user.webauthn) return;

    delete user.webauthn.currentChallenge;
    await this.saveUsers();
  }

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
}

export default new UserService();
