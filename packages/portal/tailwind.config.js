import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchored to this file rather than to the current working directory:
// Tailwind resolves relative content globs against the CWD, so a build
// started from the repo root would scan the repo root's src/ instead of
// this package's. (This is the bug that once styled the desktop renderer
// with whatever classes the portal happened to share.)
const packageDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(packageDir, 'index.html'),
    path.join(packageDir, 'src/**/*.{js,ts,jsx,tsx}'),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          surface: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
          hover: 'var(--bg-hover)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-color)',
          focus: 'var(--border-focus)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent-color)',
          hover: 'var(--accent-hover)',
          soft: 'var(--accent-soft)',
          secondary: 'var(--accent-secondary)',
        },
        status: {
          success: 'var(--status-success)',
          warning: 'var(--status-warning)',
          error: 'var(--status-error)',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'ui-monospace', 'Menlo', 'Monaco', 'monospace'],
      },
      boxShadow: {
        'glow-accent': '0 0 20px -5px var(--accent-glow)',
        'glow-subtle': '0 0 15px -3px rgba(56, 189, 248, 0.15)',
        'panel': '0 4px 20px -2px rgba(0, 0, 0, 0.25)',
      }
    },
  },
  plugins: [],
};
