import { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, audit, clientIp, createSession, rateLimit, requireParent } from '../auth.js';
import { config } from '../config.js';
import { hashSecret, newId, newToken, sha256, verifySecret } from '../lib/crypto.js';
import { open as openSecret, seal } from '../lib/secretbox.js';
import { newTotpSecret, otpauthUrl, verifyTotp } from '../lib/totp.js';
import { badRequest, conflict, HttpError, unauthorized } from '../lib/errors.js';
import { verifyGoogleIdToken } from '../lib/google.js';
import { isValidTimeZone } from '../lib/time.js';
import { body, name } from '../lib/validate.js';
import { createFamily, joinFamily } from '../services/family.js';
import { addSampleData } from '../services/sample-data.js';
import type { FamilyRow, InviteRow, ParentRow } from '../types.js';
import { toFamily, toParent } from '../types.js';

const DAY = 86_400_000;
const dummyHash = hashSecret(newToken());

const timezone = z
  .string()
  .optional()
  .transform((tz) => (tz && isValidTimeZone(tz) ? tz : 'America/New_York'));

const signupSchema = z
  .object({
    familyName: name.optional(),
    inviteCode: z.string().trim().min(20).max(100).optional(),
    name,
    email: z.email().max(200),
    password: z.string().min(8, 'Use at least 8 characters').max(200),
    timezone,
    includeSampleData: z.boolean().default(true),
  })
  .refine((v) => v.familyName || v.inviteCode, { path: ['familyName'], message: 'Family name is required' });

function usableInvite(db: AppEnv['Variables']['db'], code: string): InviteRow {
  const invite = db.get<InviteRow>('SELECT * FROM family_invites WHERE code = ?', code);
  if (!invite || invite.used_at || invite.expires_at <= new Date().toISOString()) {
    throw new HttpError(400, 'invalid_invite', 'This invite link has expired or was already used. Ask for a new one.');
  }
  return invite;
}

const loginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});

const googleSchema = z.object({
  credential: z.string().min(20),
  timezone,
});

export const authRoutes = new Hono<AppEnv>();

function sessionResponse(db: AppEnv['Variables']['db'], parent: ParentRow, family: FamilyRow) {
  const { token, expiresAt } = createSession(db, 'parent', parent.id, config.parentSessionDays * DAY);
  return { token, expiresAt, parent: toParent(parent), family: toFamily(family) };
}

/** Either a full session, or — when MFA is on — a short-lived challenge for the second step. */
function signInResponse(db: AppEnv['Variables']['db'], parent: ParentRow, family: FamilyRow) {
  if (parent.mfa_enabled !== 1) return sessionResponse(db, parent, family);
  const mfaToken = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString();
  db.run('DELETE FROM mfa_challenges WHERE parent_id = ? OR expires_at < ?', parent.id, now.toISOString());
  db.insert('mfa_challenges', {
    id: newId('mfa'),
    token_hash: sha256(mfaToken),
    parent_id: parent.id,
    created_at: now.toISOString(),
    expires_at: expiresAt,
  });
  return { mfaRequired: true as const, mfaToken, expiresAt };
}

function requireMfaKey(): string {
  if (!config.mfaEncryptionKey) {
    throw new HttpError(404, 'not_enabled', 'Two-step verification is not enabled on this server');
  }
  return config.mfaEncryptionKey;
}

authRoutes.get('/providers', (c) =>
  c.json({
    password: true,
    google: config.googleClientId ? { clientId: config.googleClientId } : null,
    mfa: Boolean(config.mfaEncryptionKey),
  }),
);

authRoutes.post('/signup', async (c) => {
  rateLimit(`signup:${clientIp(c)}`, 10, 60 * 60_000);
  const input = await body(c, signupSchema);
  const db = c.get('db');
  if (db.get('SELECT 1 AS x FROM parents WHERE email = ?', input.email)) {
    throw conflict('email_taken', 'An account with this email already exists. Try signing in.');
  }
  const passwordHash = await hashSecret(input.password);

  if (input.inviteCode) {
    const inviteCode = input.inviteCode;
    // Join an existing family as a co-parent.
    const { family, parent } = db.tx(() => {
      const invite = usableInvite(db, inviteCode);
      const family = db.get<FamilyRow>('SELECT * FROM families WHERE id = ?', invite.family_id)!;
      const parent = joinFamily(db, family, { name: input.name, email: input.email, passwordHash });
      db.run('UPDATE family_invites SET used_at = ?, used_by = ? WHERE code = ?', new Date().toISOString(), parent.id, invite.code);
      const inviter = db.get<ParentRow>('SELECT * FROM parents WHERE id = ?', invite.created_by.replace(/^parent:/, ''));
      audit(db, family.id, `parent:${parent.id}`, 'parent.joined', { type: 'parent', id: parent.id }, {
        invitedBy: inviter ? `invited by ${inviter.name}` : null,
      });
      return { family, parent };
    });
    return c.json(sessionResponse(db, parent, family), 201);
  }

  const { family, parent } = createFamily(db, {
    familyName: input.familyName!,
    parentName: input.name,
    email: input.email,
    passwordHash,
    timezone: input.timezone,
  });
  if (input.includeSampleData) addSampleData(db, family, parent);
  audit(db, family.id, `parent:${parent.id}`, 'family.created', { type: 'family', id: family.id }, {
    sampleData: input.includeSampleData,
  });
  return c.json(sessionResponse(db, parent, family), 201);
});

/** Public: what an invite link is for, so the sign-up page can say "Join the Taylors". */
authRoutes.get('/invites/:code', (c) => {
  rateLimit(`invite:${clientIp(c)}`, 30, 15 * 60_000);
  const db = c.get('db');
  const invite = usableInvite(db, c.req.param('code'));
  const family = db.get<FamilyRow>('SELECT * FROM families WHERE id = ?', invite.family_id)!;
  const inviter = invite.created_by.startsWith('parent:')
    ? db.get<ParentRow>('SELECT * FROM parents WHERE id = ?', invite.created_by.slice('parent:'.length))
    : undefined;
  return c.json({ familyName: family.name, invitedBy: inviter?.name ?? null, email: invite.email, expiresAt: invite.expires_at });
});

authRoutes.post('/login', async (c) => {
  const input = await body(c, loginSchema);
  rateLimit(`login:${clientIp(c)}`, 20, 15 * 60_000);
  rateLimit(`login:${sha256(input.email.toLowerCase())}`, 8, 15 * 60_000);
  const db = c.get('db');
  const parent = db.get<ParentRow>('SELECT * FROM parents WHERE email = ?', input.email);
  // Always run a full hash comparison so response time doesn't reveal whether the email exists.
  const ok = await verifySecret(input.password, parent?.password_hash ?? (await dummyHash));
  if (!parent || !ok) throw unauthorized('Email or password is incorrect');
  const family = db.get<FamilyRow>('SELECT * FROM families WHERE id = ?', parent.family_id)!;
  audit(db, family.id, `parent:${parent.id}`, 'parent.signed_in', { type: 'parent', id: parent.id }, { method: 'password' });
  return c.json(signInResponse(db, parent, family));
});

authRoutes.post('/mfa/verify', async (c) => {
  const input = await body(c, z.object({ mfaToken: z.string().min(10), code: z.string().trim() }));
  const key = requireMfaKey();
  const db = c.get('db');
  const challenge = db.get<{ id: string; parent_id: string; attempts: number; expires_at: string }>(
    'SELECT * FROM mfa_challenges WHERE token_hash = ?',
    sha256(input.mfaToken),
  );
  if (!challenge || challenge.expires_at <= new Date().toISOString() || challenge.attempts >= 5) {
    throw unauthorized('Your sign-in expired. Please sign in again.');
  }
  const parent = db.get<ParentRow>('SELECT * FROM parents WHERE id = ?', challenge.parent_id);
  if (!parent?.mfa_secret_enc) throw unauthorized();
  const step = verifyTotp(openSecret(parent.mfa_secret_enc, key), input.code);
  if (step === null || (parent.mfa_last_step !== null && step <= parent.mfa_last_step)) {
    db.run('UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = ?', challenge.id);
    throw new HttpError(401, 'wrong_code', 'That code isn’t right. Check your authenticator app and try again.');
  }
  db.run('UPDATE parents SET mfa_last_step = ? WHERE id = ?', step, parent.id);
  db.run('DELETE FROM mfa_challenges WHERE id = ?', challenge.id);
  const family = db.get<FamilyRow>('SELECT * FROM families WHERE id = ?', parent.family_id)!;
  return c.json(sessionResponse(db, parent, family));
});

authRoutes.post('/mfa/setup', requireParent, (c) => {
  const key = requireMfaKey();
  const db = c.get('db');
  const parent = c.get('parent');
  if (parent.mfa_enabled) throw conflict('mfa_enabled', 'Two-step verification is already on');
  const secret = newTotpSecret();
  db.run('UPDATE parents SET mfa_pending_secret_enc = ? WHERE id = ?', seal(secret, key), parent.id);
  return c.json({ secret, otpauthUrl: otpauthUrl(secret, parent.email) });
});

authRoutes.post('/mfa/enable', requireParent, async (c) => {
  const input = await body(c, z.object({ code: z.string().trim() }));
  const key = requireMfaKey();
  const db = c.get('db');
  const parent = c.get('parent');
  if (!parent.mfa_pending_secret_enc) throw badRequest('Start setup first');
  const step = verifyTotp(openSecret(parent.mfa_pending_secret_enc, key), input.code);
  if (step === null) throw new HttpError(400, 'wrong_code', 'That code isn’t right. Try the latest code from your app.');
  db.run(
    'UPDATE parents SET mfa_enabled = 1, mfa_secret_enc = mfa_pending_secret_enc, mfa_pending_secret_enc = NULL, mfa_last_step = ? WHERE id = ?',
    step,
    parent.id,
  );
  audit(db, parent.family_id, `parent:${parent.id}`, 'parent.mfa_enabled', { type: 'parent', id: parent.id });
  return c.json({ parent: toParent(db.get<ParentRow>('SELECT * FROM parents WHERE id = ?', parent.id)!) });
});

authRoutes.post('/mfa/disable', requireParent, async (c) => {
  const input = await body(c, z.object({ code: z.string().trim() }));
  const key = requireMfaKey();
  const db = c.get('db');
  const parent = c.get('parent');
  if (!parent.mfa_enabled || !parent.mfa_secret_enc) throw badRequest('Two-step verification is not on');
  if (verifyTotp(openSecret(parent.mfa_secret_enc, key), input.code) === null) {
    throw new HttpError(400, 'wrong_code', 'That code isn’t right. Try the latest code from your app.');
  }
  db.run(
    'UPDATE parents SET mfa_enabled = 0, mfa_secret_enc = NULL, mfa_pending_secret_enc = NULL, mfa_last_step = NULL WHERE id = ?',
    parent.id,
  );
  audit(db, parent.family_id, `parent:${parent.id}`, 'parent.mfa_disabled', { type: 'parent', id: parent.id });
  return c.json({ parent: toParent(db.get<ParentRow>('SELECT * FROM parents WHERE id = ?', parent.id)!) });
});

authRoutes.post('/google', async (c) => {
  if (!config.googleClientId) throw new HttpError(404, 'not_enabled', 'Google sign-in is not enabled');
  rateLimit(`google:${clientIp(c)}`, 20, 15 * 60_000);
  const input = await body(c, googleSchema);
  const identity = await verifyGoogleIdToken(input.credential, config.googleClientId);
  const db = c.get('db');
  let parent = db.get<ParentRow>('SELECT * FROM parents WHERE google_sub = ?', identity.sub);
  if (!parent) {
    const byEmail = db.get<ParentRow>('SELECT * FROM parents WHERE email = ?', identity.email);
    if (byEmail) {
      if (!identity.emailVerified) throw badRequest('Verify your Google email address first');
      db.run('UPDATE parents SET google_sub = ? WHERE id = ?', identity.sub, byEmail.id);
      parent = { ...byEmail, google_sub: identity.sub };
    }
  }
  let family: FamilyRow;
  if (parent) {
    family = db.get<FamilyRow>('SELECT * FROM families WHERE id = ?', parent.family_id)!;
  } else {
    const created = createFamily(db, {
      familyName: `${identity.name.split(' ').at(-1) ?? identity.name} family`,
      parentName: identity.name,
      email: identity.email,
      passwordHash: null,
      googleSub: identity.sub,
      timezone: input.timezone,
    });
    parent = created.parent;
    family = created.family;
    addSampleData(db, family, parent);
  }
  audit(db, family.id, `parent:${parent.id}`, 'parent.signed_in', { type: 'parent', id: parent.id }, { method: 'google' });
  return c.json(signInResponse(db, parent, family));
});

authRoutes.post('/logout', requireParent, (c) => {
  c.get('db').run('DELETE FROM sessions WHERE id = ?', c.get('session').id);
  return c.json({ ok: true });
});

authRoutes.get('/me', requireParent, (c) => c.json({ parent: toParent(c.get('parent')), family: toFamily(c.get('family')) }));
