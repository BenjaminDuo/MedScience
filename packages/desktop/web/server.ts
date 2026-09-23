import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createApiChannels,
  globalEventBus,
  globalExecutionRouter,
} from '@medscience/core';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(packageRoot, 'dist');
const isDevelopment = process.argv.includes('--dev');
const requestedPort = Number.parseInt(process.env.MEDSCIENCE_WEB_PORT || '3000', 10);
const port = Number.isFinite(requestedPort) ? requestedPort : 3000;
const host = '127.0.0.1';

const eventClients = new Set<ServerResponse>();

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error('Request body exceeds 1 MiB');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {} as T;
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function isTrustedRequest(req: IncomingMessage): boolean {
  const hostHeader = req.headers.host || '';
  const localHost = hostHeader === `${host}:${port}` || hostHeader === `localhost:${port}`;
  if (!localHost) return false;

  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const localOrigin = originUrl.hostname === host || originUrl.hostname === 'localhost';
    return originUrl.protocol === 'http:' && originUrl.port === String(port) && localOrigin;
  } catch {
    return false;
  }
}

function broadcast(event: 'runtime' | 'delta', payload: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  eventClients.forEach((client) => client.write(message));
}

globalEventBus.onAll((event) => broadcast('runtime', event));

/**
 * Every app API call arrives on one endpoint and is dispatched through the
 * shared channel registry in @medscience/core -- the same registry the
 * Electron main process registers with ipcMain. This replaced ~350 lines of
 * hand-written REST routes that had to be kept in sync, by hand, with the
 * Electron IPC handlers and the renderer's fetch wrappers.
 *
 * The endpoint stays loopback-and-same-origin only (isTrustedRequest), which
 * is what the old routes relied on too.
 */
const channels: Record<string, (...args: any[]) => any> = createApiChannels({
  onDelta: (delta) => broadcast('delta', delta),
});

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith('/api/')) return false;
  if (!isTrustedRequest(req)) {
    sendJson(res, 403, { error: 'Only same-origin loopback requests are allowed' });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', mode: 'local-web' });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    eventClients.add(res);
    req.on('close', () => eventClients.delete(res));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/rpc') {
    const body = await readJson<{ channel?: string; args?: unknown[] }>(req);
    const handler = body.channel ? channels[body.channel] : undefined;
    if (!handler) {
      sendJson(res, 404, { error: `Unknown API channel: ${body.channel}` });
      return true;
    }
    try {
      const result = await handler(...(Array.isArray(body.args) ? body.args : []));
      sendJson(res, 200, { result });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  sendJson(res, 404, { error: 'API endpoint not found' });
  return true;
}

function serveStatic(res: ServerResponse, pathname: string): void {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 400, { error: 'Invalid URL encoding' });
    return;
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const candidate = path.resolve(distDir, relativePath);
  const safeCandidate = candidate === distDir || candidate.startsWith(`${distDir}${path.sep}`);
  const filePath = safeCandidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(distDir, 'index.html');
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
  };
  res.writeHead(200, {
    'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(filePath).pipe(res);
}

async function start(): Promise<void> {
  let viteMiddleware: ((req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void) | undefined;
  if (isDevelopment) {
    const { createServer: createViteServer } = await import('vite');
    // configFile is explicit: this server is started from the repo root
    // (npm run web), and without it Vite -- and through it PostCSS/Tailwind
    // -- can pick up the marketing portal's config that sits there instead
    // of this package's.
    const vite = await createViteServer({
      root: packageRoot,
      configFile: path.join(packageRoot, 'vite.config.ts'),
      appType: 'spa',
      server: { middlewareMode: true },
    });
    viteMiddleware = vite.middlewares;
  } else if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('Web assets are missing. Run `npm --workspace=@medscience/desktop run build:renderer` first.');
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);
      if (await handleApi(req, res, url)) return;
      if (viteMiddleware) {
        viteMiddleware(req, res, (error) => {
          if (error) sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        });
        return;
      }
      serveStatic(res, url.pathname);
    } catch (error) {
      console.error('[MedScience Web]', error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : 'Internal server error' });
      } else {
        res.end();
      }
    }
  });

  server.listen(port, host, () => {
    console.log(`\nMedScience local web is running at http://${host}:${port}`);
    console.log('The server is bound to loopback only. Press Ctrl+C to stop.\n');
  });
}

start().catch((error) => {
  console.error('[MedScience Web] Failed to start:', error);
  process.exitCode = 1;
});

// Local Codex runtime processes are spawned detached (their own process
// group), so they do not die automatically when this Node process exits --
// without this, Ctrl+C-ing the dev/local-web server would leak orphaned
// `codex app-server` processes every time. Same reasoning as Electron's
// before-quit hook in electron/main.ts.
let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`
[MedScience Web] Received ${signal}, shutting down local execution backends...`);
  try {
    await globalExecutionRouter.dispose();
  } catch (error) {
    console.error('[MedScience Web] Error disposing execution backends on shutdown:', error);
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
