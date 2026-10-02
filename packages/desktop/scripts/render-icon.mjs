#!/usr/bin/env node
/**
 * Renders build/icon.svg into the icons electron-builder packages.
 *
 *   build/icon.png        1024x1024, the source for macOS .icns and Windows .ico
 *   build/icons/<n>x<n>.png   the Linux set, which must be a DIRECTORY
 *
 * Linux needs the directory, not the single PNG. Handed one file,
 * electron-builder reads the size out of its *filename*, fails, and installs
 * it to /usr/share/icons/hicolor/0x0/apps/ -- not a size freedesktop looks in,
 * so the icon silently never appears in a dock or launcher. Naming each file
 * <size>x<size>.png is what makes the sizes legible to it.
 *
 *   node scripts/render-icon.mjs
 *
 * The PNGs are committed, so this runs by hand when the mark changes, not as
 * part of a build. It needs headless Chromium and ImageMagick.
 *
 * Chromium rasterises the SVG once at 1024, and ImageMagick scales that down
 * to the rest. Rendering each size in the browser instead would be sharper in
 * principle, but headless Chromium enforces a minimum window height: ask for
 * a 128x128 screenshot and it returns the top third of the artwork, cropped,
 * not the whole thing scaled. The sizes are verified against the master's
 * opacity below so that silent cropping cannot ship again.
 *
 * Chromium is the rasteriser because the mark leans on SVG gradients and
 * feGaussianBlur, and a browser is the one renderer guaranteed to agree with
 * how the same markup looks in the app. Point CHROME_PATH at a binary if none
 * of the usual locations has one.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  copyFileSync,
  globSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The size macOS and Windows are derived from. */
const MASTER_SIZE = 1024;
/** What a Linux desktop actually looks for under hicolor/<size>x<size>/apps/. */
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(here, '..', 'build');
const svgPath = join(buildDir, 'icon.svg');
const pngPath = join(buildDir, 'icon.png');
const iconsDir = join(buildDir, 'icons');

function findChromium() {
  const explicit = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`CHROME_PATH points at a missing file: ${explicit}`);
    return explicit;
  }

  const candidates = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    // Playwright installs as chromium-<revision>/chrome-linux/chrome; take the
    // newest revision rather than assuming one.
    candidates.push(
      ...globSync('chromium-*/chrome-linux/chrome', { cwd: process.env.PLAYWRIGHT_BROWSERS_PATH })
        .sort()
        .reverse()
        .map((rel) => join(process.env.PLAYWRIGHT_BROWSERS_PATH, rel))
    );
  }
  candidates.push(
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  );

  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    throw new Error(
      'No Chromium found. Install Chrome/Chromium, or set CHROME_PATH to its executable.'
    );
  }
  return found;
}

/** Width and height straight out of the PNG's IHDR chunk. */
function pngDimensions(file) {
  const head = readFileSync(file).subarray(0, 24);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!head.subarray(0, 8).equals(signature)) throw new Error(`${file} is not a PNG`);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

function imagemagick() {
  for (const candidate of ['magick', 'convert']) {
    try {
      execFileSync(candidate, ['-version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // Try the next one.
    }
  }
  throw new Error('ImageMagick not found. Install it (brew install imagemagick / apt install imagemagick).');
}

/**
 * Mean alpha across the image. The plate covers the whole canvas bar its
 * rounded corners, so every size should land near the master's value; a size
 * that came out cropped reads far lower.
 */
function meanAlpha(magick, file) {
  const out = execFileSync(magick, [file, '-format', '%[fx:mean.a]', 'info:'], {
    encoding: 'utf8',
  });
  return Number.parseFloat(out.trim());
}

if (!existsSync(svgPath)) throw new Error(`Missing ${svgPath}`);

const work = mkdtempSync(join(tmpdir(), 'medscience-icon-'));
try {
  const chromium = findChromium();
  // The SVG is loaded inside a page rather than screenshotted directly so the
  // document's default 8px body margin cannot shift or crop the artwork.
  copyFileSync(svgPath, join(work, 'icon.svg'));

  const html = `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  img { display: block; width: ${MASTER_SIZE}px; height: ${MASTER_SIZE}px; }
</style>
<img src="icon.svg" alt="">
`;
  const page = join(work, 'icon.html');
  const master = join(work, 'master.png');
  writeFileSync(page, html);
  execFileSync(
    chromium,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      // Transparent, so the plate's rounded corners stay rounded.
      '--default-background-color=00000000',
      `--screenshot=${master}`,
      `--window-size=${MASTER_SIZE},${MASTER_SIZE}`,
      page,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );

  const { width, height } = pngDimensions(master);
  if (width !== MASTER_SIZE || height !== MASTER_SIZE) {
    throw new Error(`Expected ${MASTER_SIZE}x${MASTER_SIZE}, got ${width}x${height}`);
  }

  const magick = imagemagick();
  const masterAlpha = meanAlpha(magick, master);

  mkdirSync(iconsDir, { recursive: true });
  for (const size of LINUX_SIZES) {
    const target = join(iconsDir, `${size}x${size}.png`);
    if (size === MASTER_SIZE) {
      copyFileSync(master, target);
    } else {
      execFileSync(magick, [master, '-filter', 'Lanczos', '-resize', `${size}x${size}`, target]);
    }

    const dims = pngDimensions(target);
    if (dims.width !== size || dims.height !== size) {
      throw new Error(`${target}: expected ${size}x${size}, got ${dims.width}x${dims.height}`);
    }
    // A cropped render reads far below the master; scaling barely moves it.
    const alpha = meanAlpha(magick, target);
    if (Math.abs(alpha - masterAlpha) > 0.08) {
      throw new Error(
        `${target}: mean alpha ${alpha.toFixed(3)} is too far from the master's ` +
          `${masterAlpha.toFixed(3)} -- the artwork looks cropped, not scaled.`
      );
    }
  }
  copyFileSync(master, pngPath);

  console.log(`Wrote ${pngPath} (${MASTER_SIZE}x${MASTER_SIZE}) using ${chromium}`);
  console.log(`Wrote ${iconsDir}/ at ${LINUX_SIZES.join(', ')} via ${magick}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
