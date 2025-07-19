import { auth } from '../lib/auth.js';
import config from '../config/default.js';
import path from 'path';

class UserController {
  /**
   * Add user to organization
   */
  static async addToOrganization(req, res) {
    try {
      const { userId, organizationId, role = 'admin' } = req.body;

      if (!userId || !organizationId) {
        return res
          .status(400)
          .json({ error: 'userId and organizationId are required' });
      }

      // Use server-side better-auth API to add member
      const result = await auth.api.addMember({
        body: {
          userId,
          organizationId,
          role,
        },
      });

      if (result.error) {
        return res.status(400).json({ error: result.error.message });
      }

      res.json({ success: true, data: result.data });
    } catch (error) {
      console.error('Error adding user to organization:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Clean up foreign key references before user deletion
   */
  static async cleanupUserReferences(userId) {
    console.log(`🧹 Cleaning up references for user ${userId}`);

    const dbPath = path.join(config.storage.base, 'auth.db');
    const Database = (await import('better-sqlite3')).default;
    const cleanupDb = new Database(dbPath);

    try {
      // Find all foreign key references
      const memberships = cleanupDb
        .prepare('SELECT * FROM member WHERE userId = ?')
        .all(userId);
      const sessions = cleanupDb
        .prepare('SELECT * FROM session WHERE userId = ?')
        .all(userId);

      console.log(
        `Found ${memberships.length} memberships, ${sessions.length} sessions to clean up`,
      );

      // Remove organization memberships
      if (memberships.length > 0) {
        cleanupDb.prepare('DELETE FROM member WHERE userId = ?').run(userId);
        console.log(`✓ Removed ${memberships.length} organization memberships`);
      }

      // Remove sessions
      if (sessions.length > 0) {
        cleanupDb.prepare('DELETE FROM session WHERE userId = ?').run(userId);
        console.log(`✓ Removed ${sessions.length} sessions`);
      }

      // Remove passkeys (if table exists)
      try {
        const passkeys = cleanupDb
          .prepare('DELETE FROM passkey WHERE userId = ?')
          .run(userId);
        if (passkeys.changes > 0) {
          console.log(`✓ Removed ${passkeys.changes} passkeys`);
        }
      } catch {
        console.log('No passkeys table or no passkeys to remove');
      }

      // Remove verification tokens (if table exists)
      try {
        const verifications = cleanupDb
          .prepare('DELETE FROM verification WHERE userId = ?')
          .run(userId);
        if (verifications.changes > 0) {
          console.log(`✓ Removed ${verifications.changes} verification tokens`);
        }
      } catch {
        console.log('No verification table or no tokens to remove');
      }

      return {
        success: true,
        cleanedUp: {
          memberships: memberships.length,
          sessions: sessions.length,
        },
      };
    } finally {
      cleanupDb.close();
    }
  }

  /**
   * Delete user with proper cleanup
   */
  static async deleteUser(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      console.log(`🗑️ Deleting user ${userId}`);

      // Clean up foreign key references first
      try {
        await UserController.cleanupUserReferences(userId);
      } catch (cleanupError) {
        console.warn('Warning: Manual cleanup failed:', cleanupError);
        // Continue with deletion anyway
      }

      // Now delete the user through better-auth
      const result = await auth.api.removeUser({
        headers: req.headers,
        body: { userId },
      });

      if (result.error) {
        return res.status(400).json({ error: result.error.message });
      }

      console.log(`✅ User ${userId} deleted successfully`);
      res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

export default UserController;
