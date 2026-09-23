import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tailwind's PostCSS plugin looks for tailwind.config.js by searching up
// from the current working directory when no config path is given. `npm run
// web` starts the local server from the repo root, where the marketing
// portal keeps its own tailwind.config.js and its own src/ -- so the
// desktop renderer was built with the portal's class list and any utility
// only this app used (w-[318px], w-[296px], ...) was silently missing from
// the stylesheet. Naming the config explicitly makes it CWD-independent.
const packageDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(packageDir, 'tailwind.config.js') },
    autoprefixer: {},
  },
};
