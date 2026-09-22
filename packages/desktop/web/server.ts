import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fallbackMockProvider,
  GenericModelClient,
  globalEventBus,
  globalExecutionProfileManager,
  globalExecutionRouter,
  globalProfileManager,
  globalRuntimeDetector,
  globalRuntimeUsageStore,
  discoverAllRuntimes,
  bindLocalRuntime,
  globalSessionManager,
  globalWorkspaceManager,
  globalToolRegistry,
  globalTeamProfileManager,
  globalTeamAgentRegistry,
  globalTeamOrchestrator,
  type AgentId,
  type ExecutionProfile,
  type ModelProfile,
  type RuntimeApprovalDecision,
  type LocalRuntimeKind,
  type ResearchTeamDefinition,
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

function sanitizeProfile(profile: ModelProfile | undefined): ModelProfile | undefined {
  return profile ? { ...profile, apiKey: '' } : undefined;
}

function profileWithStoredSecret(profile: ModelProfile): ModelProfile {
  if (profile.apiKey) return profile;
  const stored = profile.id ? globalProfileManager.getProfile(profile.id) : undefined;
  return stored?.apiKey ? { ...profile, apiKey: stored.apiKey } : profile;
}

function broadcast(event: 'runtime' | 'delta', payload: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  eventClients.forEach((client) => client.write(message));
}

globalEventBus.onAll((event) => broadcast('runtime', event));

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

  if (req.method === 'GET' && url.pathname === '/api/model/profiles') {
    sendJson(res, 200, globalProfileManager.listProfiles().map(sanitizeProfile));
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/model/active') {
    sendJson(res, 200, sanitizeProfile(globalProfileManager.getActiveProfile()));
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/model/profiles') {
    const incoming = await readJson<ModelProfile>(req);
    const result = globalProfileManager.saveProfile(profileWithStoredSecret(incoming));
    sendJson(res, result.success ? 200 : 400, {
      ...result,
      profile: sanitizeProfile(result.profile),
    });
    return true;
  }
  const profileMatch = url.pathname.match(/^\/api\/model\/profiles\/([^/]+)$/);
  if (req.method === 'DELETE' && profileMatch) {
    sendJson(res, 200, globalProfileManager.deleteProfile(decodeURIComponent(profileMatch[1])));
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/model/active') {
    const { id } = await readJson<{ id?: string }>(req);
    sendJson(res, 200, Boolean(id && globalProfileManager.setActiveProfile(id)));
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/model/test') {
    const incoming = profileWithStoredSecret(await readJson<ModelProfile>(req));
    const provider = incoming.baseUrl && incoming.model ? new GenericModelClient(incoming) : fallbackMockProvider;
    sendJson(res, 200, await provider.testConnection());
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/sessions') {
    sendJson(res, 200, globalSessionManager.listSessions());
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/workspaces') {
    sendJson(res, 200, globalWorkspaceManager.listWorkspaces());
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/workspaces') {
    const body = await readJson<{ title?: string; description?: string }>(req);
    const title = body.title?.trim();
    if (!title) {
      sendJson(res, 400, { error: 'A non-empty title is required' });
      return true;
    }
    sendJson(res, 201, globalWorkspaceManager.createWorkspace(title, undefined, body.description));
    return true;
  }
  const projectRenameMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/rename$/);
  if (req.method === 'POST' && projectRenameMatch) {
    const { title } = await readJson<{ title?: string }>(req);
    sendJson(
      res,
      200,
      Boolean(title && globalWorkspaceManager.renameWorkspace(decodeURIComponent(projectRenameMatch[1]), title)),
    );
    return true;
  }
  const projectMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if (req.method === 'DELETE' && projectMatch) {
    sendJson(res, 200, globalWorkspaceManager.deleteWorkspace(decodeURIComponent(projectMatch[1])));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/sessions') {
    const body = await readJson<{
      title?: string;
      agentId?: AgentId;
      profileId?: string;
      modelName?: string;
      workspaceId?: string;
      researchProfileId?: string;
    }>(req);
    const session = globalSessionManager.createSession(
      body.title?.trim() || 'New Scientific Exploration',
      body.workspaceId || 'proj-1',
      body.agentId || 'research',
      body.profileId,
      body.modelName,
      undefined,
      'research',
      body.researchProfileId || 'general',
    );
    sendJson(res, 201, session);
    return true;
  }
  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === 'GET' && sessionMatch) {
    const session = globalSessionManager.getSession(decodeURIComponent(sessionMatch[1]));
    sendJson(res, session ? 200 : 404, session || { error: 'Session not found' });
    return true;
  }
  if (req.method === 'DELETE' && sessionMatch) {
    sendJson(res, 200, globalSessionManager.deleteSession(decodeURIComponent(sessionMatch[1])));
    return true;
  }
  const renameMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/rename$/);
  if (req.method === 'POST' && renameMatch) {
    const { title } = await readJson<{ title?: string }>(req);
    sendJson(
      res,
      200,
      Boolean(title && globalSessionManager.renameSession(decodeURIComponent(renameMatch[1]), title)),
    );
    return true;
  }
  const exportMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/export$/);
  if (req.method === 'GET' && exportMatch) {
    sendJson(res, 200, globalSessionManager.exportSessionMarkdown(decodeURIComponent(exportMatch[1])));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/agent/inquiries') {
    const body = await readJson<{
      prompt?: string;
      sessionId?: string;
      executionProfileId?: string;
      sessionType?: 'chat' | 'research';
      workspaceId?: string;
      researchProfileId?: string;
      language?: 'en' | 'zh';
    }>(req);
    const prompt = body.prompt?.trim();
    if (!prompt) {
      sendJson(res, 400, { error: 'A non-empty prompt is required' });
      return true;
    }
    // Routes through ExecutionRouter (same as Electron's agentIpc.ts) rather
    // than calling the API research engine directly, so the active
    // ExecutionProfile (API vs local Codex, set in Settings) decides which
    // backend actually runs this turn -- keeping the Web bridge and the
    // Electron app symmetric rather than the Web build being permanently
    // API-only. executionProfileId (from the prompt bar's permission
    // selector) overrides the active profile for this one request only.
    const result = await globalExecutionRouter.execute(
      {
        prompt,
        sessionId: body.sessionId,
        executionProfileId: body.executionProfileId,
        sessionType: body.sessionType,
        workspaceId: body.workspaceId,
        researchProfileId: body.researchProfileId,
        language: body.language,
      },
      { onDelta: (delta) => broadcast('delta', delta) }
    );
    sendJson(res, 200, result);
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/agent/tools') {
    sendJson(
      res,
      200,
      globalToolRegistry.list().map((t) => ({ name: t.name, description: t.description, category: t.category }))
    );
    return true;
  }
  const cancelMatch = url.pathname.match(/^\/api\/agent\/runs\/([^/]+)\/cancel$/);
  if (req.method === 'POST' && cancelMatch) {
    sendJson(res, 200, await globalExecutionRouter.cancel(decodeURIComponent(cancelMatch[1])));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/runtime/profiles') {
    sendJson(res, 200, globalExecutionProfileManager.listProfiles());
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/runtime/profiles') {
    const incoming = await readJson<ExecutionProfile>(req);
    sendJson(res, 200, globalExecutionProfileManager.saveProfile(incoming));
    return true;
  }
  const runtimeProfileMatch = url.pathname.match(/^\/api\/runtime\/profiles\/([^/]+)$/);
  if (req.method === 'DELETE' && runtimeProfileMatch) {
    sendJson(res, 200, globalExecutionProfileManager.deleteProfile(decodeURIComponent(runtimeProfileMatch[1])));
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/runtime/active') {
    sendJson(res, 200, globalExecutionProfileManager.getActiveProfile());
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/runtime/active') {
    const { id } = await readJson<{ id?: string }>(req);
    sendJson(res, 200, Boolean(id && globalExecutionProfileManager.setActiveProfile(id)));
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/runtime/detect') {
    const { executablePath } = await readJson<{ executablePath?: string }>(req);
    sendJson(res, 200, await globalRuntimeDetector.probe(executablePath));
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/runtime/active-sessions') {
    sendJson(res, 200, globalExecutionRouter.listActiveLocalSessions());
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/runtime/usage') {
    sendJson(res, 200, globalRuntimeUsageStore.getAllUsage());
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/runtime/discover') {
    sendJson(res, 200, await discoverAllRuntimes());
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/runtime/bind') {
    const { runtime, executablePath } = await readJson<{ runtime?: LocalRuntimeKind; executablePath?: string }>(req);
    if (!runtime) {
      sendJson(res, 400, { error: 'runtime is required' });
      return true;
    }
    sendJson(res, 200, await bindLocalRuntime(runtime, executablePath));
    return true;
  }
  const approvalMatch = url.pathname.match(/^\/api\/runtime\/approvals\/([^/]+)$/);
  if (req.method === 'POST' && approvalMatch) {
    const { sessionId, decision } = await readJson<{ sessionId?: string; decision?: RuntimeApprovalDecision }>(req);
    if (!sessionId || !decision) {
      sendJson(res, 400, { error: 'sessionId and decision are required' });
      return true;
    }
    sendJson(res, 200, globalExecutionRouter.respondApproval(sessionId, decodeURIComponent(approvalMatch[1]), decision));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/teams/agents') {
    sendJson(res, 200, globalTeamAgentRegistry.list());
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/teams') {
    const includeArchived = url.searchParams.get('includeArchived') === '1';
    sendJson(res, 200, globalTeamProfileManager.listAll(includeArchived));
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/teams') {
    const incoming = await readJson<ResearchTeamDefinition>(req);
    sendJson(res, 200, globalTeamProfileManager.saveTeam({ ...incoming, id: undefined as any }));
    return true;
  }
  const teamCloneMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/clone$/);
  if (req.method === 'POST' && teamCloneMatch) {
    const overrides = await readJson<{ name?: string; description?: string }>(req);
    sendJson(res, 200, globalTeamProfileManager.cloneTemplate(decodeURIComponent(teamCloneMatch[1]), overrides));
    return true;
  }
  const teamArchiveMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/archive$/);
  if (req.method === 'POST' && teamArchiveMatch) {
    sendJson(res, 200, globalTeamProfileManager.archiveTeam(decodeURIComponent(teamArchiveMatch[1])));
    return true;
  }
  const teamMatch = url.pathname.match(/^\/api\/teams\/([^/]+)$/);
  if (req.method === 'GET' && teamMatch) {
    sendJson(res, 200, globalTeamProfileManager.getTeam(decodeURIComponent(teamMatch[1])));
    return true;
  }
  if (req.method === 'PUT' && teamMatch) {
    const incoming = await readJson<ResearchTeamDefinition>(req);
    sendJson(res, 200, globalTeamProfileManager.saveTeam({ ...incoming, id: decodeURIComponent(teamMatch[1]) }));
    return true;
  }

  const teamRunsForTeamMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/runs$/);
  if (req.method === 'POST' && teamRunsForTeamMatch) {
    const { inquiry, sessionId, workspaceId, researchProfileId } = await readJson<{
      inquiry?: string;
      sessionId?: string;
      workspaceId?: string;
      researchProfileId?: string;
    }>(req);
    if (!inquiry?.trim()) {
      sendJson(res, 400, { error: 'A non-empty inquiry is required' });
      return true;
    }
    try {
      const record = await globalTeamOrchestrator.startRun(
        decodeURIComponent(teamRunsForTeamMatch[1]),
        inquiry,
        sessionId,
        workspaceId,
        researchProfileId
      );
      sendJson(res, 200, record);
    } catch (err: any) {
      sendJson(res, 400, { error: err?.message || String(err) });
    }
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/team-runs') {
    const teamId = url.searchParams.get('teamId') || undefined;
    const workspaceId = url.searchParams.get('workspaceId') || undefined;
    sendJson(res, 200, globalTeamOrchestrator.listRuns(teamId, workspaceId));
    return true;
  }
  const teamRunApprovePlanMatch = url.pathname.match(/^\/api\/team-runs\/([^/]+)\/approve-plan$/);
  if (req.method === 'POST' && teamRunApprovePlanMatch) {
    try {
      sendJson(res, 200, await globalTeamOrchestrator.approvePlan(decodeURIComponent(teamRunApprovePlanMatch[1])));
    } catch (err: any) {
      sendJson(res, 400, { error: err?.message || String(err) });
    }
    return true;
  }
  const teamRunPauseMatch = url.pathname.match(/^\/api\/team-runs\/([^/]+)\/pause$/);
  if (req.method === 'POST' && teamRunPauseMatch) {
    sendJson(res, 200, globalTeamOrchestrator.pauseRun(decodeURIComponent(teamRunPauseMatch[1])));
    return true;
  }
  const teamRunResumeMatch = url.pathname.match(/^\/api\/team-runs\/([^/]+)\/resume$/);
  if (req.method === 'POST' && teamRunResumeMatch) {
    sendJson(res, 200, globalTeamOrchestrator.resumeRun(decodeURIComponent(teamRunResumeMatch[1])));
    return true;
  }
  const teamRunCancelMatch = url.pathname.match(/^\/api\/team-runs\/([^/]+)\/cancel$/);
  if (req.method === 'POST' && teamRunCancelMatch) {
    sendJson(res, 200, globalTeamOrchestrator.cancelRun(decodeURIComponent(teamRunCancelMatch[1])));
    return true;
  }
  const teamRunMatch = url.pathname.match(/^\/api\/team-runs\/([^/]+)$/);
  if (req.method === 'GET' && teamRunMatch) {
    sendJson(res, 200, globalTeamOrchestrator.getRun(decodeURIComponent(teamRunMatch[1])));
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
    const vite = await createViteServer({
      root: packageRoot,
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
