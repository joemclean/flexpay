import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { open, seal } from '../src/lib/secretbox.js';
import { base32Encode, currentStep, totpAt, verifyTotp } from '../src/lib/totp.js';

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 test vectors', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    // RFC 6238 Appendix B (8-digit values; we use the last 6 digits).
    assert.equal(totpAt(secret, Math.floor(59 / 30)), '287082');
    assert.equal(totpAt(secret, Math.floor(1111111109 / 30)), '081804');
    assert.equal(totpAt(secret, Math.floor(1234567890 / 30)), '005924');
  });

  it('accepts one step of clock drift but not more', () => {
    const secret = base32Encode(randomBytes(20));
    const now = Date.now();
    const step = currentStep(now);
    assert.equal(verifyTotp(secret, totpAt(secret, step - 1), now), step - 1);
    assert.equal(verifyTotp(secret, totpAt(secret, step + 1), now), step + 1);
    assert.equal(verifyTotp(secret, totpAt(secret, step + 3), now), null);
    assert.equal(verifyTotp(secret, 'abcdef', now), null);
  });
});

describe('secretbox', () => {
  it('round-trips and rejects the wrong key', () => {
    const sealed = seal('JBSWY3DPEHPK3PXP', 'key-one');
    assert.equal(open(sealed, 'key-one'), 'JBSWY3DPEHPK3PXP');
    assert.throws(() => open(sealed, 'key-two'));
  });
});

describe('parent two-step verification', () => {
  config.mfaEncryptionKey = randomBytes(32).toString('hex');
  const db = openDatabase(':memory:');
  const app = createApp(db, { logRequests: false });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(`/api/v1${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, json: (await res.json()) as any };
  };

  it('enrolls, then requires a fresh code at sign-in', async () => {
    const email = `mfa+${randomBytes(3).toString('hex')}@example.com`;
    const password = randomBytes(12).toString('base64url');
    const signup = await call('POST', '/auth/signup', { familyName: 'M', name: 'M', email, password, includeSampleData: false });
    const token = signup.json.token;
    assert.equal((await call('GET', '/auth/providers')).json.mfa, true);

    const setup = await call('POST', '/auth/mfa/setup', undefined, token);
    assert.equal(setup.status, 200);
    assert.match(setup.json.otpauthUrl, /^otpauth:\/\/totp\//);
    const secret: string = setup.json.secret;
    assert.equal((await call('POST', '/auth/mfa/enable', { code: '000000' }, token)).status, 400);
    const enable = await call('POST', '/auth/mfa/enable', { code: totpAt(secret, currentStep()) }, token);
    assert.equal(enable.status, 200);
    assert.equal(enable.json.parent.mfaEnabled, true);

    const login = await call('POST', '/auth/login', { email, password });
    assert.equal(login.json.mfaRequired, true);
    assert.equal(login.json.token, undefined, 'no session before the second factor');

    // The code used for enrollment can't be replayed.
    const replay = await call('POST', '/auth/mfa/verify', { mfaToken: login.json.mfaToken, code: totpAt(secret, currentStep()) });
    assert.equal(replay.status, 401);
    const verified = await call('POST', '/auth/mfa/verify', { mfaToken: login.json.mfaToken, code: totpAt(secret, currentStep() + 1) });
    assert.equal(verified.status, 200);
    assert.ok(verified.json.token);
    // A challenge token is single-use.
    assert.equal((await call('POST', '/auth/mfa/verify', { mfaToken: login.json.mfaToken, code: totpAt(secret, currentStep() + 1) })).status, 401);
  });
});
