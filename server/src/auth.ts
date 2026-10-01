import type { Context, MiddlewareHandler } from 'hono';
import type { Db } from './db.js';
import { newId, newToken, sha256 } from './lib/crypto.js';
import { tooManyRequests, unauthorized } from './lib/errors.js';
import type { ChildRow, DeviceRow, FamilyRow, ParentRow, SessionRow } from './types.js';

export type AppEnv = {
  Variables: {
    db: Db;
    session: SessionRow;
    parent: ParentRow;
    family: FamilyRow;
    device: DeviceRow;
    child: ChildRow;
  };
};

export type AppContext = Context<AppEnv>;

export function createSession(db: Db, kind: SessionRow['kind'], subjectId: string, ttlMs: number): { token: string; expiresAt: string } {
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  db.insert('sessions', {
    id: newId('ses'),
    token_hash: sha256(token),
    kind,
    subject_id: subjectId,
    created_at: now.toISOString(),
    expires_at: expiresAt,
    last_used_at: now.toISOString(),
  });
  return { token, expiresAt };
}

export function revokeSessions(db: Db, kind: SessionRow['kind'], subjectId: string): void {
  db.run('DELETE FROM sessions WHERE kind = ? AND subject_id = ?', kind, subjectId);
}

function bearer(c: AppContext): string | null {
  const header = c.req.header('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

function loadSession(c: AppContext, kind: SessionRow['kind']): SessionRow {
  const token = bearer(c);
  if (!token) throw unauthorized();
  const db = c.get('db');
  const session = db.get<SessionRow>('SELECT * FROM sessions WHERE token_hash = ? AND kind = ?', sha256(token), kind);
  if (!session) throw unauthorized('Your session is not valid. Please sign in again.');
  const now = new Date();
  if (session.expires_at <= now.toISOString()) {
    db.run('DELETE FROM sessions WHERE id = ?', session.id);
    throw unauthorized('Your session has expired. Please sign in again.');
  }
  // Throttle writes: update last_used_at at most once a minute.
  if (now.getTime() - Date.parse(session.last_used_at) > 60_000) {
    db.run('UPDATE sessions SET last_used_at = ? WHERE id = ?', now.toISOString(), session.id);
  }
  c.set('session', session);
  return session;
}

export const requireParent: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = loadSession(c, 'parent');
  const db = c.get('db');
  const parent = db.get<ParentRow>('SELECT * FROM parents WHERE id = ?', session.subject_id);
  if (!parent) throw unauthorized();
  const family = db.get<FamilyRow>('SELECT * FROM families WHERE id = ?', parent.family_id);
  if (!family) throw unauthorized();
  c.set('parent', parent);
  c.set('family', family);
  await next();
};

const DISCONNECTED = 'This device has been disconnected. Ask a grown-up for a new code.';

function loadDeviceContext(c: AppContext, deviceId: string): void {
  const db = c.get('db');
  const device = db.get<DeviceRow>('SELECT * FROM devices WHERE id = ? AND revoked_at IS NULL', deviceId);
  const child = device ? db.get<ChildRow>('SELECT * FROM children WHERE id = ?', device.child_id) : undefined;
  const family = child ? db.get<FamilyRow>('SELECT * FROM families WHERE id = ?', child.family_id) : undefined;
  if (!device || !child || !family) throw unauthorized(DISCONNECTED);
  const now = new Date();
  if (now.getTime() - Date.parse(device.last_seen_at) > 60_000) {
    db.run('UPDATE devices SET last_seen_at = ? WHERE id = ?', now.toISOString(), device.id);
  }
  c.set('device', device);
  c.set('child', child);
  c.set('family', family);
}

/** A paired device (before PIN unlock). */
export const requireDevice: MiddlewareHandler<AppEnv> = async (c, next) => {
  loadDeviceContext(c, loadSession(c, 'device').subject_id);
  await next();
};

/** A kid session, unlocked with the PIN on a paired device. Subject is the device id. */
export const requireKid: MiddlewareHandler<AppEnv> = async (c, next) => {
  loadDeviceContext(c, loadSession(c, 'kid').subject_id);
  await next();
};

// ---- Rate limiting (in-memory, per process) --------------------------------

const buckets = new Map<string, number[]>();

const MAX_BUCKETS = 10_000;
const BUCKET_TTL_MS = 60 * 60_000; // longest window we use

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, hits] of buckets) if (now - (hits.at(-1) ?? 0) > BUCKET_TTL_MS) buckets.delete(k);
  }
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) throw tooManyRequests();
  hits.push(now);
  buckets.set(key, hits);
}

/** Remove expired credentials. Safe to call often. */
export function purgeExpired(db: Db, now = new Date()): void {
  const iso = now.toISOString();
  db.run('DELETE FROM sessions WHERE expires_at <= ?', iso);
  db.run('DELETE FROM mfa_challenges WHERE expires_at <= ?', iso);
  // Keep used/expired pairing codes for a day for support/audit, then drop them.
  db.run('DELETE FROM pairing_codes WHERE expires_at <= ?', new Date(now.getTime() - 86_400_000).toISOString());
}

export function clientIp(c: AppContext): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';
}

export function audit(
  db: Db,
  familyId: string,
  actor: string,
  action: string,
  target?: { type: string; id: string },
  details?: Record<string, unknown>,
): void {
  db.insert('audit_events', {
    id: newId('aud'),
    family_id: familyId,
    actor,
    action,
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    details: details ? JSON.stringify(details) : null,
    created_at: new Date().toISOString(),
  });
}
