import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { type AppEnv, requireParent } from './auth.js';
import { config } from './config.js';
import type { Db } from './db.js';
import { HttpError } from './lib/errors.js';
import { activityRoutes } from './routes/activities.js';
import { authRoutes } from './routes/auth.js';
import { childrenRoutes } from './routes/children.js';
import { familyRoutes } from './routes/family.js';
import { kidDeviceRoutes, kidPublicRoutes, kidRoutes } from './routes/kid.js';
import { moneyRoutes } from './routes/money.js';

export function createApp(db: Db, options: { logRequests?: boolean } = {}) {
  const app = new Hono<AppEnv>();

  app.use(secureHeaders());
  app.use(
    '/api/*',
    cors({
      origin: (origin) => (config.corsOrigins.includes(origin) ? origin : null),
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );
  if (options.logRequests ?? config.logRequests) {
    app.use(async (c, next) => {
      const start = performance.now();
      await next();
      // Never log headers or bodies: they can contain tokens, PINs or passwords.
      console.log(`${c.req.method} ${c.req.path} → ${c.res.status} (${(performance.now() - start).toFixed(0)}ms)`);
    });
  }
  app.use(async (c, next) => {
    c.set('db', db);
    await next();
  });

  app.get('/api/v1/health', (c) => c.json({ ok: true, service: 'flexfund-family-account', time: new Date().toISOString() }));

  // Note: a sub-app's `use()` middleware is mounted as a wildcard under its prefix,
  // so groups are ordered from most to least specific and never share a prefix.
  const parentApi = new Hono<AppEnv>();
  parentApi.use(requireParent);
  parentApi.route('/', familyRoutes);
  parentApi.route('/', childrenRoutes);
  parentApi.route('/', moneyRoutes);
  parentApi.route('/', activityRoutes);

  const api = new Hono<AppEnv>();
  api.route('/auth', authRoutes);
  api.route('/kid', kidPublicRoutes); //   /kid/pair            (no auth)
  api.route('/kid/device', kidDeviceRoutes); // /kid/device/*   (paired device token)
  api.route('/kid', kidRoutes); //         /kid/*               (PIN-unlocked kid session)
  api.route('/', parentApi); //            everything else      (parent session)
  app.route('/api/v1', api);

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Route not found' } }, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message, ...(err.details ?? {}) } }, err.status);
    }
    console.error('Unhandled error:', err);
    return c.json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } }, 500);
  });

  return app;
}
