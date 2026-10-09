// The TDMS API on Vercel: every /api/* request is routed here (vercel.json)
// and handed to the Fastify app, compiled by `npm run build` into
// server/dist/vercel.js. See server/src/vercel.ts.
export { default } from '../server/dist/vercel.js';
