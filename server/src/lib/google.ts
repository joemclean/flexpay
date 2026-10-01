import { createPublicKey, createVerify } from 'node:crypto';
import { unauthorized } from './errors.js';

/**
 * Verifies a Google Identity Services ID token (RS256 JWT) against Google's
 * published JWKS. Only a public client ID is required — no client secret.
 */

interface GoogleJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

let cachedKeys: { keys: GoogleJwk[]; expires: number } | null = null;

async function googleKeys(): Promise<GoogleJwk[]> {
  if (cachedKeys && cachedKeys.expires > Date.now()) return cachedKeys.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw unauthorized('Could not verify Google sign-in right now');
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  const json = (await res.json()) as { keys: GoogleJwk[] };
  cachedKeys = { keys: json.keys, expires: Date.now() + maxAge * 1000 };
  return json.keys;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
}

export async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<GoogleIdentity> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw unauthorized('Invalid Google credential');
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  const header = decodeSegment<{ alg: string; kid: string }>(headerB64);
  if (header.alg !== 'RS256') throw unauthorized('Invalid Google credential');

  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw unauthorized('Invalid Google credential');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  const valid = verifier.verify(createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' }), Buffer.from(signatureB64, 'base64url'));
  if (!valid) throw unauthorized('Invalid Google credential');

  const payload = decodeSegment<{
    iss: string;
    aud: string;
    exp: number;
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  }>(payloadB64);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw unauthorized('Invalid Google credential');
  if (payload.aud !== clientId) throw unauthorized('Invalid Google credential');
  if (payload.exp * 1000 < Date.now()) throw unauthorized('Google credential expired');
  if (!payload.email) throw unauthorized('Google account has no email');
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name ?? payload.email.split('@')[0] ?? 'Parent',
  };
}
