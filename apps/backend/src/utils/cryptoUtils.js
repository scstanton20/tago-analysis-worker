/**
 * Cryptographic utilities for secure data encryption and decryption
 * Provides AES-256-GCM authenticated encryption with PBKDF2 key derivation.
 *
 * Security Features:
 * - AES-256-GCM: Authenticated encryption preventing tampering
 * - PBKDF2: Key derivation with 100,000 iterations
 * - Random salt and IV: Unique per encryption operation
 * - Authentication tag: Validates data integrity on decryption
 *
 * Encrypted Data Format:
 * - salt:iv:authTag:encrypted (all hex-encoded, colon-separated)
 * - Example: "a1b2...c3d4:e5f6...g7h8:i9j0...k1l2:m3n4...o5p6"
 *
 * Requirements:
 * - SECRET_KEY must be configured in application config
 * - Module initialization will throw if SECRET_KEY is missing
 *
 * @module cryptoUtils
 */
// utils/cryptoUtils.js
import crypto from 'crypto';
import config from '../config/default.js';
import { createChildLogger } from './logging/logger.js';

const logger = createChildLogger('crypto-utils');
const SECRET_KEY = config.secretKey;

if (!SECRET_KEY) {
  const error = new Error('SECRET_KEY is missing from config!');
  logger.error({ err: error }, 'Crypto initialization failed');
  throw error;
}

/**
 * Derive encryption key from secret and salt using PBKDF2
 * Uses 100,000 iterations with SHA-256 to produce a 32-byte key
 *
 * @param {string} secret - Master secret key from configuration
 * @param {Buffer} salt - Random salt for key derivation (16 bytes)
 * @returns {Buffer} Derived 32-byte encryption key
 *
 * Security:
 * - PBKDF2 with 100,000 iterations provides resistance to brute-force attacks
 * - Salt ensures different keys for same secret across encryptions
 * - Synchronous operation acceptable as key derivation is needed per operation
 *
 * @private
 */
function deriveKey(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha256');
}

/**
 * Encrypt plaintext using AES-256-GCM authenticated encryption
 * Generates unique salt and IV per encryption for security
 *
 * @param {string} text - Plaintext string to encrypt
 * @returns {string} Encrypted data in format "salt:iv:authTag:encrypted" (hex-encoded)
 *
 * Process:
 * 1. Generate random 16-byte salt
 * 2. Derive encryption key from SECRET_KEY and salt using PBKDF2
 * 3. Generate random 12-byte IV (initialization vector)
 * 4. Encrypt plaintext with AES-256-GCM
 * 5. Extract authentication tag for integrity verification
 * 6. Return concatenated salt:iv:authTag:encrypted
 *
 * Security:
 * - Each encryption uses unique salt and IV
 * - Authentication tag prevents tampering detection
 * - Key derivation makes brute-force attacks computationally expensive
 *
 * Use Case:
 * - Encrypting sensitive configuration data (API keys, tokens)
 * - Storing credentials in database
 *
 * @example
 * const encrypted = encrypt("my-secret-api-key");
 * // Returns: "a1b2c3d4...e5f6:g7h8i9j0...k1l2:m3n4o5p6...q7r8:s9t0..."
 */
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

/**
 * Decrypt ciphertext using AES-256-GCM with authentication
 * Validates data integrity and detects tampering attempts
 *
 * @param {string} encryptedText - Encrypted data in format "salt:iv:authTag:encrypted" (hex-encoded)
 * @returns {string} Decrypted plaintext string
 * @throws {Error} If encrypted data format is invalid
 * @throws {Error} If authentication fails (data tampering detected)
 *
 * Process:
 * 1. Parse encrypted string into salt, IV, authTag, and ciphertext
 * 2. Derive decryption key from SECRET_KEY and extracted salt
 * 3. Initialize AES-256-GCM decipher with key and IV
 * 4. Set authentication tag for integrity verification
 * 5. Decrypt and verify data integrity
 * 6. Return plaintext if authentication succeeds
 *
 * Security:
 * - Authentication tag validation prevents accepting tampered data
 * - Invalid format or missing components throw immediately
 * - Failed authentication is logged and wrapped in descriptive error
 *
 * Error Handling:
 * - "Invalid encrypted data format": Missing or malformed components
 * - "Authentication failed": Data has been modified or corrupted
 *
 * Use Case:
 * - Decrypting stored API keys or credentials
 * - Retrieving encrypted configuration values
 *
 * @example
 * try {
 *   const plaintext = decrypt("a1b2c3d4...e5f6:g7h8i9j0...k1l2:m3n4o5p6...q7r8:s9t0...");
 *   // Returns: "my-secret-api-key"
 * } catch (error) {
 *   console.error("Decryption failed:", error.message);
 * }
 */
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
