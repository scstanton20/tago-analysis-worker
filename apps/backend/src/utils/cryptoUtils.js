// utils/cryptoUtils.js
import crypto from 'crypto';
import config from '../config/default.js';

const SECRET_KEY = config.secretKey;

if (!SECRET_KEY) {
  throw new Error('SECRET_KEY is missing from config!');
}

function deriveKey(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha256');
}

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
  return (
    salt.toString('hex') +
    ':' +
    iv.toString('hex') +
    ':' +
    authTag.toString('hex') +
    ':' +
    encrypted
  );
}

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
    return decrypted;
  } catch (error) {
    throw new Error(
      'Authentication failed - data may have been tampered with',
      error,
    );
  }
}

export { encrypt, decrypt };
