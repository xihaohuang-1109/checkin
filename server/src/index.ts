import { createApp } from './app';
import { getEnv } from './config/env';
import { disconnectDb } from './db/client';
import { retryFailedSyncs } from './services/syncQueue';

async function main() {
  const env = getEnv();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 Server running at http://localhost:${env.PORT}`);
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