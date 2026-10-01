import path from 'node:path';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: intFromEnv('PORT', 8787),
  /** "::" listens on IPv6 and IPv4, so "localhost" (which resolves to ::1 first) connects immediately. */
  host: process.env.HOST ?? '::',
  /** SQLite file path. Use ":memory:" for tests. */
  databasePath: process.env.DATABASE_PATH ?? path.resolve(import.meta.dirname, '..', 'data', 'flexfund.db'),
  /** Comma-separated list of origins allowed to call the API from a browser. */
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  /** How often the allowance scheduler looks for due schedules. */
  schedulerIntervalMs: intFromEnv('SCHEDULER_INTERVAL_MS', 15_000),
  /** Optional: enables "Sign in with Google" when set. A client ID is public, not a secret. */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  /**
   * Optional: enables parent multi-factor auth (TOTP). Used to encrypt TOTP seeds at rest.
   * Supply from a secrets manager at runtime; never commit it.
   */
  mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY ?? '',
  parentSessionDays: intFromEnv('PARENT_SESSION_DAYS', 14),
  deviceSessionDays: intFromEnv('DEVICE_SESSION_DAYS', 180),
  kidSessionHours: intFromEnv('KID_SESSION_HOURS', 12),
  pairingCodeMinutes: intFromEnv('PAIRING_CODE_MINUTES', 15),
  pinMaxAttempts: intFromEnv('PIN_MAX_ATTEMPTS', 5),
  pinLockMinutes: intFromEnv('PIN_LOCK_MINUTES', 5),
  logRequests: process.env.LOG_REQUESTS !== 'false',
};

export type Config = typeof config;
