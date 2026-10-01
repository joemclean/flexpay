import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { purgeExpired } from './auth.js';
import { config } from './config.js';
import { openDatabase } from './db.js';
import { startScheduler } from './services/scheduler.js';

const db = openDatabase(config.databasePath);
const app = createApp(db);
const stopScheduler = startScheduler(db, config.schedulerIntervalMs);
purgeExpired(db);
const purgeTimer = setInterval(() => purgeExpired(db), 60 * 60_000);
purgeTimer.unref();

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`FlexFund Family Account API listening on http://localhost:${info.port}/api/v1`);
  console.log(`Database: ${config.databasePath}`);
});

function shutdown() {
  stopScheduler();
  clearInterval(purgeTimer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
