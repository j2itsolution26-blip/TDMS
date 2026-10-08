import path from 'node:path';
import { buildApp } from './app';

/**
 * Entry point: `npm run server` in development, `npm start` in production.
 *
 * Environment comes from the process (Vercel/Render/systemd) or, locally,
 * from .env via Node's --env-file flag in the npm scripts.
 */
const port = Number(process.env.PORT ?? (process.env.NODE_ENV === 'production' ? 3000 : 3001));
const host = process.env.HOST ?? (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

const clientDist = path.resolve(process.cwd(), 'client/dist');

const app = await buildApp({ clientDist, logger: true });

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
