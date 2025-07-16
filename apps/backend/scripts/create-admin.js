// Script to create initial admin user
import { auth } from '../src/lib/auth.js';
import Database from 'better-sqlite3';
import path from 'path';
import config from '../src/config/default.js';

async function createAdminUser() {
  try {
    console.log('Creating admin user...');

    // Create the admin user
    const result = await auth.api.signUpEmail({
      body: {
        name: 'Administrator',
        email: 'admin@example.com',
        password: 'admin123',
        username: 'admin',
      },
      headers: {},
    });

    if (result.user) {
      console.log('✅ Admin user created successfully');
      console.log('User ID:', result.user.id);

      // Set admin role using direct database update
      console.log('Setting admin role manually...');

      const dbPath = path.join(config.storage.base, 'auth.db');
      const db = new Database(dbPath);

      const updateResult = db
        .prepare('UPDATE user SET role = ? WHERE id = ?')
        .run('admin', result.user.id);

      db.close();

      if (updateResult.changes > 0) {
        console.log('✅ Admin role assigned successfully');
      } else {
        console.log('⚠️ Role assignment may have failed');
      }
      console.log('');
      console.log('Admin user credentials:');
      console.log('Email: admin@example.com');
      console.log('Username: admin');
      console.log('Password: admin123');
      console.log('');
      console.log('You can now sign in with these credentials.');
    } else {
      console.log('❌ Failed to create admin user');
      console.log('Result:', result);
    }
  } catch (error) {
    console.error('Error creating admin user:', error.message);
  }
}

createAdminUser();
