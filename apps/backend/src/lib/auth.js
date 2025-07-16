import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins/admin';
import { passkey } from 'better-auth/plugins/passkey';
import { username } from 'better-auth/plugins/username';
import { multiSession } from 'better-auth/plugins/multi-session';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import config from '../config/default.js';

// Ensure the storage directory exists
const dbPath = path.join(config.storage.base, 'auth.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

export const auth = betterAuth({
  database: db,
  user: {
    changeEmail: {
      enabled: true,
    },
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'viewer',
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: false, // Enable if using subdomains
    },
  },
  plugins: [
    username(),
    multiSession({
      maximumSessions: 10, // Allow up to 10 concurrent sessions per user
    }),
    admin({
      adminRoles: ['admin'],
      defaultRole: 'viewer',
    }),
    passkey({
      rpName: 'Tago Analysis Runner',
      rpID: process.env.PRODUCTION_DOMAIN || 'localhost',
    }),
  ],
  secret: process.env.SECRET_KEY || 'default-dev-secret-change-in-production',
  trustedOrigins: ['http://localhost:5173', 'http://localhost:3000'],
});

// TODO: Better Auth admin initialization
// The admin role is manually set in the database for now
