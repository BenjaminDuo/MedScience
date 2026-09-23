import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const packageDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  // PostCSS (and therefore Tailwind) is resolved explicitly from this
  // package. Vite otherwise loads whichever postcss.config.js sits in the
  // current working directory -- and `npm run web` starts the local server
  // from the repo root, where the marketing portal has its own config and
  // its own src/. The desktop renderer was being styled from the portal's
  // sources, so any utility class only this app used was silently dropped.
  css: {
    postcss: packageDir,
  },
  server: {
    port: 3000,
    host: true,
  },
});
