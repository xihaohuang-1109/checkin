import { createApp } from './app';
import { getEnv } from './config/env';
import { disconnectDb } from './db/client';
import { retryFailedSyncs } from './services/syncQueue';

/**
 * Self keep-alive: ping our own /api/health every 10 minutes.
 * Render's free tier spins a web service down after ~15 min without
 * inbound traffic. A periodic self-request keeps the process busy so
 * the instance stays awake without needing an external uptime monitor.
 * Uses fetch (Node 18+) so no extra dependency is required.
 */
const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000; // 10 min < 15 min idle threshold

function startKeepAlive(port: number): void {
  const baseUrl = `http://127.0.0.1:${port}`;
  const ping = () => {
    fetch(`${baseUrl}/api/health`)
      .then((res) => res.json())
      .then((body) => console.log(`[KeepAlive] ping ok (${JSON.stringify(body).slice(0, 80)})`))
      .catch((err) => console.warn(`[KeepAlive] ping failed: ${err.message}`));
  };
  // Ping once shortly after boot, then on an interval.
  setTimeout(ping, 30_000);
  const timer = setInterval(ping, KEEPALIVE_INTERVAL_MS);
  timer.unref(); // don't prevent process exit
  console.log(`[KeepAlive] self-ping every ${KEEPALIVE_INTERVAL_MS / 60000} min enabled`);
}

async function main() {
  const env = getEnv();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 Server running at http://localhost:${env.PORT}`);
    startKeepAlive(env.PORT);
  });

  // Retry any pending syncs on startup (after a brief delay to let DB settle)
  setTimeout(async () => {
    try {
      const result = await retryFailedSyncs();
      if (result.total > 0) {
        console.log(`[Startup] Retried ${result.total} pending syncs: ${result.succeeded} succeeded`);
      }
    } catch (err) {
      console.error('[Startup] Failed to retry syncs:', err);
    }
  }, 3000);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    server.close();
    await disconnectDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});