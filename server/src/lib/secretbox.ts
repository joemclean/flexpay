import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM field encryption for sensitive values at rest (e.g. TOTP seeds).
 * The key is supplied at runtime via an environment variable from a secrets
 * manager — it is never written to disk by this app.
 */

function key(material: string): Buffer {
  return createHash('sha256').update(material).digest();
}

export function seal(plaintext: string, material: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(material), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function open(sealed: string, material: string): string {
  const [version, ivB64, tagB64, dataB64] = sealed.split('.');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Unsupported sealed value');
  const decipher = createDecipheriv('aes-256-gcm', key(material), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}
