/** AES-256-GCM encryption utilities with PBKDF2 key derivation */
// utils/cryptoUtils.js
import crypto from 'crypto';
import { config } from '../config/default.js';
import { createChildLogger } from './logging/logger.js';

const logger = createChildLogger('crypto-utils');
const SECRET_KEY = config.secretKey;

if (!SECRET_KEY) {
  const error = new Error('SECRET_KEY is missing from config!');
  logger.error({ err: error }, 'Crypto initialization failed');
  throw error;
}

/** Derive encryption key from secret and salt using PBKDF2 (100k iterations, SHA-256) */
function deriveKey(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha256');
}

/** Encrypt plaintext using AES-256-GCM authenticated encryption */
function encrypt(text) {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(SECRET_KEY, salt);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get the authentication tag
  const authTag = cipher.getAuthTag();

  // Store salt + iv + authTag + encrypted data
  const result =
    salt.toString('hex') +
    ':' +
    iv.toString('hex') +
    ':' +
    authTag.toString('hex') +
    ':' +
    encrypted;

  logger.debug('Data encrypted successfully');
  return result;
}

/** Decrypt ciphertext using AES-256-GCM with authentication */
function decrypt(encryptedText) {
  const [saltHex, ivHex, authTagHex, encrypted] = encryptedText.split(':');

  if (!saltHex || !ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted data format');
  }

  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = deriveKey(SECRET_KEY, salt);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  try {
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    logger.debug('Data decrypted successfully');
    return decrypted;
  } catch (error) {
    logger.error({ err: error }, 'Decryption failed - possible data tampering');
    const decryptError = new Error(
      'Authentication failed - data may have been tampered with',
    );
    decryptError.cause = error;
    throw decryptError;
  }
}

export { encrypt, decrypt };
