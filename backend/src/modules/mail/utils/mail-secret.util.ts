import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Enkripcija SMTP lozinke u mirovanju (AES-256-GCM).
 *
 * Ključ se izvodi iz `MAIL_CONFIG_SECRET` env varijable (preporučeno: 32+
 * nasumična znaka). Ako nije postavljena, ključ se derivira iz `JWT_SECRET`
 * da postojeće instalacije rade bez dodatne konfiguracije — u tom slučaju
 * promjena JWT_SECRET-a čini sačuvanu SMTP lozinku nečitljivom i mora se
 * ponovo unijeti u postavkama.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_DERIVATION_SALT = 'evidens-mail-config-v1';

export const deriveMailSecretKey = (secret: string): Buffer =>
  scryptSync(secret, KEY_DERIVATION_SALT, 32);

export const resolveMailSecretKey = (
  env: NodeJS.ProcessEnv = process.env,
): Buffer | null => {
  const secret = env.MAIL_CONFIG_SECRET?.trim() || env.JWT_SECRET?.trim();
  if (!secret) {
    return null;
  }
  return deriveMailSecretKey(secret);
};

/** Format: `v1:<iv base64>:<authTag base64>:<ciphertext base64>` */
export const encryptMailSecret = (plainText: string, key: Buffer): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
};

export const decryptMailSecret = (stored: string, key: Buffer): string | null => {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    return null;
  }
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const authTag = Buffer.from(parts[2], 'base64');
    const ciphertext = Buffer.from(parts[3], 'base64');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};
