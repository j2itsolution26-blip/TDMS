/**
 * CommonJS, not ESM: package.json no longer sets "type": "module" (that
 * was there for Laravel's Vite build), so Next reads this file as CJS.
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
