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

// Option 1: Using GCM mode (provides built-in authentication)
function encrypt(text) {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(SECRET_KEY, salt);
  const iv = crypto.randomBytes(12); // GCM uses 12-byte IV

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get the authentication tag - CRITICAL for GCM
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
  const parts = encryptedText.split(':');

  // Handle both old format (3 parts) and new format (4 parts)
  if (parts.length === 3) {
    // Legacy CBC format - convert to handle existing data
    const [saltHex, ivHex, encrypted] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const key = deriveKey(SECRET_KEY, salt);

    // Use CBC for legacy data
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } else if (parts.length === 4) {
    const [saltHex, ivHex, authTagHex, encrypted] = parts;

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
  } else {
    throw new Error('Invalid encrypted data format');
  }
}

// Alternative Option 2: CBC + HMAC (Encrypt-then-MAC)
function encryptWithHMAC(text) {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(SECRET_KEY, salt);

  // Derive separate keys for encryption and MAC
  const encKey = key.subarray(0, 32);
  const macKey = crypto.pbkdf2Sync(
    SECRET_KEY + 'mac',
    salt,
    100000,
    32,
    'sha256',
  );

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', encKey, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Create HMAC over salt + iv + encrypted data
  const dataToAuth =
    salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
  const hmac = crypto.createHmac('sha256', macKey);
  hmac.update(dataToAuth);
  const mac = hmac.digest('hex');

  return dataToAuth + ':' + mac;
}

function decryptWithHMAC(encryptedText) {
  const parts = encryptedText.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }

  const [saltHex, ivHex, encrypted, receivedMac] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const key = deriveKey(SECRET_KEY, salt);

  // Derive the same keys
  const encKey = key.subarray(0, 32);
  const macKey = crypto.pbkdf2Sync(
    SECRET_KEY + 'mac',
    salt,
    100000,
    32,
    'sha256',
  );

  const dataToAuth = saltHex + ':' + ivHex + ':' + encrypted;
  const hmac = crypto.createHmac('sha256', macKey);
  hmac.update(dataToAuth);
  const computedMac = hmac.digest('hex');

  if (
    !crypto.timingSafeEqual(
      Buffer.from(receivedMac, 'hex'),
      Buffer.from(computedMac, 'hex'),
    )
  ) {
    throw new Error('Authentication failed - data may have been tampered with');
  }

  // Now decrypt
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', encKey, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Export both approaches - GCM is generally preferred for new applications
export { encrypt, decrypt, encryptWithHMAC, decryptWithHMAC };
