// utils/cryptoUtils.js
import crypto from 'crypto';
import config from '../config/default.js';

const SECRET_KEY = config.secretKey;

if (!SECRET_KEY) {
  throw new Error('SECRET_KEY is missing from config!');
}

function deriveKey(secret) {
  return crypto.pbkdf2Sync(secret, 'analysis_salt', 100000, 32, 'sha256');
}

function encrypt(text) {
  const key = deriveKey(SECRET_KEY);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  const key = deriveKey(SECRET_KEY);
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export { encrypt, decrypt };