import { ChildProcess, spawn } from 'child_process';
import { once } from 'events';
import { existsSync } from 'fs';
import { join } from 'path';
import type { ToolId, ToolRuntimeStatus } from './toolDefinitions.js';
import type { ToolConfigFile, WebSearchToolSettings } from './toolConfig.js';

export interface ToolRuntimeSnapshot {
  status: ToolRuntimeStatus;
  message?: string;
  updatedAt: string;
}

interface ManagedRuntime {
  backendProcess: ChildProcess | null;
  sidecarProcess: ChildProcess | null;
  snapshot: ToolRuntimeSnapshot;
}

function now() {
  return new Date().toISOString();
}

async function ping(url: string, timeoutMs: number): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
}

function sidecarEntry(projectRoot: string, name: 'searchBackend' | 'searchSidecar') {
  const distPath = join(projectRoot, 'packages', 'server', 'dist', 'sidecars', `${name}.js`);
  if (existsSync(distPath)) {
    return { command: process.execPath, args: [distPath] };
  }

  return {
    command: process.execPath,
    args: [
      join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      join(projectRoot, 'packages', 'server', 'src', 'sidecars', `${name}.ts`),
    ],
  };
}

export class ToolRuntimeManager {
  private runtimes = new Map<ToolId, ManagedRuntime>();

  constructor(
    private readonly dataDir: string,
    private readonly projectRoot: string,
  ) {}

  private getRuntime(toolId: ToolId): ManagedRuntime {
    const existing = this.runtimes.get(toolId);
    if (existing) return existing;
    const runtime: ManagedRuntime = {
      backendProcess: null,
      sidecarProcess: null,
      snapshot: { status: 'stopped', updatedAt: now() },
    };
    this.runtimes.set(toolId, runtime);
    return runtime;
  }

  private setSnapshot(toolId: ToolId, snapshot: Partial<ToolRuntimeSnapshot>) {
    const runtime = this.getRuntime(toolId);
    runtime.snapshot = {
      ...runtime.snapshot,
      ...snapshot,
      updatedAt: now(),
    };
  }

  getSnapshot(toolId: ToolId, enabled: boolean, config?: ToolConfigFile['tools'][ToolId]): ToolRuntimeSnapshot {
    if (!enabled) return { status: 'disabled', updatedAt: now() };
    if (!config) return { status: 'error', message: `No runtime config found for ${toolId}.`, updatedAt: now() };
    if (config.runtimeMode === 'builtin') return { status: 'ready', updatedAt: now() };
    return this.getRuntime(toolId).snapshot;
  }

  async check(toolId: ToolId, config: ToolConfigFile['tools'][ToolId]): Promise<ToolRuntimeSnapshot> {
    if (config.runtimeMode === 'builtin') {
      return { status: 'ready', updatedAt: now() };
    }

    if (toolId !== 'web_search') {
      const snapshot = { status: 'error' as const, message: `${toolId} runtime is not implemented yet.`, updatedAt: now() };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    }

    const webConfig = config as WebSearchToolSettings;
    try {
      if (config.runtimeMode === 'local') {
        const backendResponse = await ping(`http://127.0.0.1:${webConfig.backend.port}/health`, 1500);
        const sidecarResponse = await ping(`http://127.0.0.1:${webConfig.sidecar.port}/health`, 1500);
        const snapshot = {
          status: backendResponse.ok && sidecarResponse.ok ? ('ready' as const) : ('error' as const),
          message:
            backendResponse.ok && sidecarResponse.ok
              ? `Local search stack is ready on ${webConfig.backend.port}/${webConfig.sidecar.port}.`
              : `Local search stack is unhealthy (backend ${backendResponse.status}, sidecar ${sidecarResponse.status}).`,
          updatedAt: now(),
        };
        this.setSnapshot(toolId, snapshot);
        return snapshot;
      }

      const response = await ping(`http://127.0.0.1:${webConfig.sidecar.port}/health`, 1500);
      const snapshot = {
        status: response.ok ? ('ready' as const) : ('error' as const),
        message: response.ok
          ? `External search interface ${webConfig.sidecar.port} is ready.`
          : `External search interface returned ${response.status}.`,
        updatedAt: now(),
      };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    } catch (error: unknown) {
      const snapshot = {
        status: 'stopped' as const,
        message: error instanceof Error ? error.message : String(error),
        updatedAt: now(),
      };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    }
  }

  async ensureReady(toolId: ToolId, config: ToolConfigFile['tools'][ToolId]) {
    const current = await this.check(toolId, config);
    if (current.status === 'ready') return current;
    return this.start(toolId, config);
  }

  async start(toolId: ToolId, config: ToolConfigFile['tools'][ToolId]): Promise<ToolRuntimeSnapshot> {
    if (config.runtimeMode === 'builtin') {
      return { status: 'ready', updatedAt: now() };
    }

    if (toolId !== 'web_search') {
      const snapshot = { status: 'error' as const, message: `${toolId} runtime is not implemented yet.`, updatedAt: now() };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    }

    const webConfig = config as WebSearchToolSettings;
    const runtime = this.getRuntime(toolId);
    const backendRunning = runtime.backendProcess && runtime.backendProcess.exitCode === null;
    const sidecarRunning = runtime.sidecarProcess && runtime.sidecarProcess.exitCode === null;

    if ((config.runtimeMode === 'local' && backendRunning && sidecarRunning) || (config.runtimeMode === 'external' && sidecarRunning)) {
      return this.check(toolId, config);
    }

    if (sidecarRunning || backendRunning) {
      runtime.sidecarProcess?.kill();
      runtime.backendProcess?.kill();
      runtime.sidecarProcess = null;
      runtime.backendProcess = null;
    }

    if (config.runtimeMode === 'external' && !webConfig.externalBaseURL.trim()) {
      const snapshot = { status: 'error' as const, message: 'External search mode requires an External Base URL.', updatedAt: now() };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    }

    this.setSnapshot(toolId, {
      status: 'starting',
      message: config.runtimeMode === 'local' ? 'Starting local search stack...' : 'Starting external search interface...',
    });

    let backend: ChildProcess | null = null;
    let sidecar: ChildProcess | null = null;

    try {
      if (config.runtimeMode === 'local') {
        const entry = sidecarEntry(this.projectRoot, 'searchBackend');
        backend = spawn(entry.command, entry.args, {
          cwd: this.projectRoot,
          env: {
            ...process.env,
            TOOL_RUNTIME_DATA_DIR: this.dataDir,
            SEARCH_BACKEND_PORT: String(webConfig.backend.port),
            SEARCH_LOCAL_PROVIDER: webConfig.localProvider,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        runtime.backendProcess = backend;
        backend.stdout?.on('data', () => {});
        backend.stderr?.on('data', () => {});
        backend.once('exit', (code, signal) => {
          this.setSnapshot(toolId, {
            status: 'stopped',
            message: `Local search backend exited${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}.`,
          });
          runtime.backendProcess = null;
        });

        await Promise.race([
          this.waitUntilReady(webConfig.backend.port, 4000, 'backend'),
          once(backend, 'error').then(([error]) => {
            throw error;
          }),
        ]);
      }

      const entry = sidecarEntry(this.projectRoot, 'searchSidecar');
      sidecar = spawn(entry.command, entry.args, {
        cwd: this.projectRoot,
        env: {
          ...process.env,
          TOOL_RUNTIME_DATA_DIR: this.dataDir,
          SEARCH_SIDECAR_PORT: String(webConfig.sidecar.port),
          SEARCH_RUNTIME_MODE: config.runtimeMode,
          SEARCH_BACKEND_URL: config.runtimeMode === 'local' ? `http://127.0.0.1:${webConfig.backend.port}` : '',
          SEARCH_EXTERNAL_BASE_URL: config.runtimeMode === 'external' ? webConfig.externalBaseURL : '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      runtime.sidecarProcess = sidecar;
      sidecar.stdout?.on('data', () => {});
      sidecar.stderr?.on('data', () => {});
      sidecar.once('exit', (code, signal) => {
        this.setSnapshot(toolId, {
          status: 'stopped',
          message: `Search interface exited${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}.`,
        });
        runtime.sidecarProcess = null;
      });

      await Promise.race([
        this.waitUntilReady(webConfig.sidecar.port, 4000, 'sidecar'),
        once(sidecar, 'error').then(([error]) => {
          throw error;
        }),
      ]);

      return this.check(toolId, config);
    } catch (error: unknown) {
      backend?.kill();
      sidecar?.kill();
      runtime.backendProcess = null;
      runtime.sidecarProcess = null;
      const snapshot = { status: 'error' as const, message: error instanceof Error ? error.message : String(error), updatedAt: now() };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    }
  }

  async stop(toolId: ToolId, config: ToolConfigFile['tools'][ToolId]): Promise<ToolRuntimeSnapshot> {
    if (config.runtimeMode === 'builtin') {
      return { status: 'ready', updatedAt: now() };
    }

    const runtime = this.getRuntime(toolId);
    if ((!runtime.backendProcess || runtime.backendProcess.exitCode !== null) && (!runtime.sidecarProcess || runtime.sidecarProcess.exitCode !== null)) {
      const snapshot = { status: 'stopped' as const, message: 'Runtime is already stopped.', updatedAt: now() };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    }

    runtime.sidecarProcess?.kill();
    runtime.backendProcess?.kill();
    runtime.sidecarProcess = null;
    runtime.backendProcess = null;
    const snapshot = {
      status: 'stopped' as const,
      message: config.runtimeMode === 'local' ? 'Local search stack stopped.' : 'External search interface stopped.',
      updatedAt: now(),
    };
    this.setSnapshot(toolId, snapshot);
    return snapshot;
  }

  async restart(toolId: ToolId, config: ToolConfigFile['tools'][ToolId]) {
    await this.stop(toolId, config);
    return this.start(toolId, config);
  }

  private async waitUntilReady(port: number, timeoutMs: number, component: 'backend' | 'sidecar') {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await ping(`http://127.0.0.1:${port}/health`, 500);
        if (response.ok) return;
      } catch {
        /* keep waiting */
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out waiting for ${component} on port ${port}.`);
  }
}

const scopedManagers = new Map<string, ToolRuntimeManager>();

export function getToolRuntimeManager(dataDir: string, projectRoot = process.cwd()) {
  const key = `${projectRoot}::${dataDir}`;
  let manager = scopedManagers.get(key);
  if (!manager) {
    manager = new ToolRuntimeManager(dataDir, projectRoot);
    scopedManagers.set(key, manager);
  }
  return manager;
}
