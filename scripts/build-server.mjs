// Compiles the Fastify server (TypeScript + path aliases) into ESM files under
// server/dist. npm packages stay external and load from node_modules at
// runtime; only TDMS's own code is bundled.
//
//   server/dist/server.js   `npm start` — a long-running server (any Node host)
//   server/dist/vercel.js   the same app as a Vercel Function (api/index.js)
import { build } from 'esbuild';

await build({
  entryPoints: { server: 'server/src/server.ts', vercel: 'server/src/vercel.ts' },
  outdir: 'server/dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  tsconfig: 'server/tsconfig.json',
  sourcemap: true,
  logLevel: 'info',
});
