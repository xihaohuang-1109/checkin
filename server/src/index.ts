import { createApp } from './app';
import { getEnv } from './config/env';
import { disconnectDb } from './db/client';

async function main() {
  const env = getEnv();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 Server running at http://localhost:${env.PORT}`);
  });

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