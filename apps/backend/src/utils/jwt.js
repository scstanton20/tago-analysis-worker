import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/default.js';

const JWT_SECRET = config.secretKey;
const JWT_EXPIRES_IN = '2h'; // Shorter access token life
const JWT_REFRESH_EXPIRES_IN = '24h'; // Shorter refresh token life

// In-memory blacklist for invalidated tokens (in production, use Redis)
const tokenBlacklist = new Set();

// Active sessions by user ID (in production, use Redis)
const activeSessions = new Map();

if (!JWT_SECRET) {
  throw new Error('SECRET_KEY is required for JWT operations');
}

export function generateTokens(user) {
  const sessionId = uuidv4();
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    sessionId,
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'tago-analysis-runner',
  });

  const refreshToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    issuer: 'tago-analysis-runner',
  });

  // Track active session
  if (!activeSessions.has(user.id)) {
    activeSessions.set(user.id, new Set());
  }
  activeSessions.get(user.id).add(sessionId);

  return { accessToken, refreshToken, sessionId };
}

export function verifyToken(token) {
  try {
    // Check if token is blacklisted
    if (tokenBlacklist.has(token)) {
      throw new Error('Token invalidated');
    }

    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'tago-analysis-runner',
    });

    // Check if session is still active
    if (decoded.sessionId && !isSessionActive(decoded.id, decoded.sessionId)) {
      throw new Error('Session invalidated');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw error;
  }
}

export function invalidateToken(token) {
  tokenBlacklist.add(token);

  // Remove session from active sessions
  try {
    const decoded = jwt.decode(token);
    if (decoded?.id && decoded?.sessionId) {
      const userSessions = activeSessions.get(decoded.id);
      if (userSessions) {
        userSessions.delete(decoded.sessionId);
        if (userSessions.size === 0) {
          activeSessions.delete(decoded.id);
        }
      }
    }
  } catch {
    // Ignore decode errors
  }

  // Clean up expired tokens periodically (basic cleanup)
  if (tokenBlacklist.size > 10000) {
    cleanupBlacklist();
  }
}

export function invalidateAllUserSessions(userId) {
  const userSessions = activeSessions.get(userId);
  if (!userSessions) return [];

  const invalidatedSessions = Array.from(userSessions);

  // Add all user's tokens to blacklist (we can't get the actual tokens, so we track by sessionId)
  // This approach requires checking sessionId in verifyToken
  activeSessions.delete(userId);

  return invalidatedSessions;
}

export function isSessionActive(userId, sessionId) {
  const userSessions = activeSessions.get(userId);
  return userSessions?.has(sessionId) || false;
}

function cleanupBlacklist() {
  const currentTime = Math.floor(Date.now() / 1000);
  const tokensToRemove = [];

  for (const token of tokenBlacklist) {
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp && decoded.exp < currentTime) {
        tokensToRemove.push(token);
      }
    } catch {
      tokensToRemove.push(token);
    }
  }

  tokensToRemove.forEach((token) => tokenBlacklist.delete(token));
}

export function extractTokenFromHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}
