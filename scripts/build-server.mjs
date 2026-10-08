// Compiles the Fastify server (TypeScript + path aliases) into one ESM file,
// server/dist/server.js. npm packages stay external and load from
// node_modules at runtime; only TDMS's own code is bundled.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/src/server.ts'],
  outfile: 'server/dist/server.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  tsconfig: 'server/tsconfig.json',
  sourcemap: true,
  logLevel: 'info',
});
