import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * The React app.
 *
 * Development: Vite serves it on :3000 and forwards /api to the Fastify
 * server on :3001, so the browser sees one origin — cookies, CSRF checks and
 * the URLs in emails behave exactly as in production.
 *
 * Production: `npm run build` writes client/dist, which the Fastify server
 * serves itself; there is no separate frontend server.
 *
 * There is deliberately no "@/server" alias: screens may import the TYPES
 * of their server loaders (erased at build time), and any attempt to import
 * server CODE into the browser fails the build instead of shipping it.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here('..'), '');
  return {
    root: here('.'),
    envDir: here('..'),
    // Nothing from .env reaches the browser except what is named here.
    envPrefix: 'TDMS_PUBLIC_',
    plugins: [react()],
    resolve: {
      alias: [
        { find: /^@\/components\//, replacement: `${here('./src/components')}/` },
        { find: /^@\/lib\//, replacement: `${here('./src/lib')}/` },
        { find: /^@\/pages\//, replacement: `${here('./src/pages')}/` },
        { find: /^@\/layouts\//, replacement: `${here('./src/layouts')}/` },
        { find: /^@shared\//, replacement: `${here('../shared')}/` },
      ],
    },
    define: {
      // shared/lib/institution-time reads this; the browser must use the
      // same institutional timezone as the server.
      'process.env.APP_TIMEZONE': JSON.stringify(env.APP_TIMEZONE ?? ''),
    },
    css: {
      postcss: { plugins: [tailwindcss({ config: here('./tailwind.config.ts') }), autoprefixer()] },
    },
    server: {
      port: 3000,
      strictPort: true,
      proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } },
    },
    build: {
      outDir: here('./dist'),
      emptyOutDir: true,
    },
  };
});
