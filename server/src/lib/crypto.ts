import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const KEY_LENGTH = 64;

/** Hash a password or PIN with scrypt. Format: scrypt$<salt b64>$<hash b64>. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(secret, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifySecret(secret: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const derived = await scryptAsync(secret, Buffer.from(saltB64, 'base64'), expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Opaque bearer token. Only its SHA-256 hash is persisted. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const ID_ALPHABET = '0123456789abcdefghijkmnpqrstuvwxyz';

/** Prefixed, URL-safe, random identifier, e.g. "chd_4k2n9x7q1m3p". */
export function newId(prefix: string): string {
  let out = '';
  for (let i = 0; i < 14; i++) out += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return `${prefix}_${out}`;
}

const PAIRING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Human-friendly one-time code without ambiguous characters (no 0/O, 1/I/L). */
export function newPairingCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  return out;
}

export function randomDigits(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String(randomInt(10));
  return out;
}
