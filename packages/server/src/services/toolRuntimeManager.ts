import { ChildProcess, spawn } from 'child_process';
import { once } from 'events';
import { join } from 'path';
import type { ToolRuntimeStatus } from './toolDefinitions.js';
import type { ToolId } from './toolDefinitions.js';
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

export class ToolRuntimeManager {
  private runtimes = new Map<ToolId, ManagedRuntime>();

  constructor(private readonly projectRoot: string) {}

  private getRuntime(toolId: ToolId): ManagedRuntime {
    const existing = this.runtimes.get(toolId);
    if (existing) return existing;
    const runtime: ManagedRuntime = {
      backendProcess: null,
      sidecarProcess: null,
      snapshot: {
        status: 'stopped',
        updatedAt: now(),
      },
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
    if (!enabled) {
      return {
        status: 'disabled',
        updatedAt: now(),
      };
    }

    if (!config) {
      return {
        status: 'error',
        message: `No runtime config found for ${toolId}.`,
        updatedAt: now(),
      };
    }

    if (config.runtimeMode === 'builtin') {
      return {
        status: 'ready',
        updatedAt: now(),
      };
    }

    return this.getRuntime(toolId).snapshot;
  }

  async check(toolId: ToolId, config: ToolConfigFile['tools'][ToolId]): Promise<ToolRuntimeSnapshot> {
    if (config.runtimeMode === 'builtin') {
      return {
        status: 'ready',
        updatedAt: now(),
      };
    }

    if (toolId !== 'web_search') {
      const snapshot = {
        status: 'error' as const,
        message: `${toolId} runtime is not implemented yet.`,
        updatedAt: now(),
      };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    }

    const webConfig = config as WebSearchToolSettings;

    if (config.runtimeMode === 'local') {
      try {
        const backendResponse = await ping(`http://127.0.0.1:${webConfig.backend.port}/health`, 1500);
        const sidecarResponse = await ping(`http://127.0.0.1:${webConfig.sidecar.port}/health`, 1500);
        const backendReady = backendResponse.ok;
        const sidecarReady = sidecarResponse.ok;
        const snapshot = {
          status: backendReady && sidecarReady ? ('ready' as const) : ('error' as const),
          message:
            !backendReady || !sidecarReady
              ? `Local search stack is unhealthy (backend ${backendResponse.status}, sidecar ${sidecarResponse.status}).`
              : `Local search backend ${webConfig.backend.port} and interface ${webConfig.sidecar.port} are ready.`,
          updatedAt: now(),
        };
        this.setSnapshot(toolId, snapshot);
        return snapshot;
      } catch (error: unknown) {
        const message =
          error instanceof Error && error.cause && typeof error.cause === 'object' && 'code' in error.cause
            ? `Local search stack unavailable: ${(error.cause as { code?: string }).code ?? error.message}`
            : error instanceof Error
              ? error.message
              : String(error);
        const snapshot = {
          status: 'stopped' as const,
          message,
          updatedAt: now(),
        };
        this.setSnapshot(toolId, snapshot);
        return snapshot;
      }
    }

    try {
      const sidecarResponse = await ping(`http://127.0.0.1:${webConfig.sidecar.port}/health`, 1500);
      const snapshot = {
        status: sidecarResponse.ok ? ('ready' as const) : ('error' as const),
        message: sidecarResponse.ok
          ? `External search interface ${webConfig.sidecar.port} is ready.`
          : `External search interface returned ${sidecarResponse.status}.`,
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

  async ensureReady(toolId: ToolId, config: ToolConfigFile['tools'][ToolId]): Promise<ToolRuntimeSnapshot> {
    const current = await this.check(toolId, config);
    if (current.status === 'ready') {
      return current;
    }

    return this.start(toolId, config);
  }

  async start(toolId: ToolId, config: ToolConfigFile['tools'][ToolId]): Promise<ToolRuntimeSnapshot> {
    if (config.runtimeMode === 'builtin') {
      return {
        status: 'ready',
        updatedAt: now(),
      };
    }

    if (toolId !== 'web_search') {
      const snapshot = {
        status: 'error' as const,
        message: `${toolId} runtime is not implemented yet.`,
        updatedAt: now(),
      };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    }

    const webConfig = config as WebSearchToolSettings;
    const runtime = this.getRuntime(toolId);
    const backendRunning = runtime.backendProcess && runtime.backendProcess.exitCode === null;
    const sidecarRunning = runtime.sidecarProcess && runtime.sidecarProcess.exitCode === null;
    if (config.runtimeMode === 'local' && backendRunning && sidecarRunning) {
      return this.check(toolId, config);
    }

    if (config.runtimeMode === 'external' && sidecarRunning) {
      return this.check(toolId, config);
    }

    if (sidecarRunning || backendRunning) {
      runtime.sidecarProcess?.kill();
      runtime.backendProcess?.kill();
      runtime.sidecarProcess = null;
      runtime.backendProcess = null;
    }

    this.setSnapshot(toolId, {
      status: 'starting',
      message:
        config.runtimeMode === 'local'
          ? 'Starting local search backend and interface...'
          : 'Starting external search interface...',
    });

    if (config.runtimeMode === 'external' && !webConfig.externalBaseURL.trim()) {
      const snapshot = {
        status: 'error' as const,
        message: 'External search mode requires an External Base URL.',
        updatedAt: now(),
      };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    }

    let backend: ChildProcess | null = null;
    if (config.runtimeMode === 'local') {
      backend = spawn(
        process.execPath,
        [
          join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
          join(process.cwd(), 'packages', 'server', 'src', 'sidecars', 'searchBackend.ts'),
        ],
        {
          cwd: this.projectRoot,
          env: {
            ...process.env,
            SEARCH_BACKEND_PORT: String(webConfig.backend.port),
            SEARCH_LOCAL_PROVIDER: webConfig.localProvider,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

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
    }

    let sidecar: ChildProcess | null = null;

    try {
      if (config.runtimeMode === 'local' && backend) {
        await Promise.race([
          this.waitUntilReady(webConfig.backend.port, 4000, 'backend'),
          once(backend, 'error').then(([error]) => {
            throw error;
          }),
        ]);
      }

      sidecar = spawn(
        process.execPath,
        [
          join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
          join(process.cwd(), 'packages', 'server', 'src', 'sidecars', 'searchSidecar.ts'),
        ],
        {
          cwd: this.projectRoot,
          env: {
            ...process.env,
            SEARCH_SIDECAR_PORT: String(webConfig.sidecar.port),
            SEARCH_RUNTIME_MODE: config.runtimeMode,
            SEARCH_BACKEND_URL:
              config.runtimeMode === 'local' ? `http://127.0.0.1:${webConfig.backend.port}` : '',
            SEARCH_EXTERNAL_BASE_URL: config.runtimeMode === 'external' ? webConfig.externalBaseURL : '',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      runtime.sidecarProcess = sidecar;
      sidecar.stdout?.on('data', () => {});
      sidecar.stderr?.on('data', () => {});
      sidecar.once('exit', (code, signal) => {
        this.setSnapshot(toolId, {
          status: 'stopped',
          message: `Sidecar exited${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}.`,
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
      const snapshot = {
        status: 'error' as const,
        message: error instanceof Error ? error.message : String(error),
        updatedAt: now(),
      };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    }
  }

  async stop(toolId: ToolId, config: ToolConfigFile['tools'][ToolId]): Promise<ToolRuntimeSnapshot> {
    if (config.runtimeMode === 'builtin') {
      return {
        status: 'ready',
        updatedAt: now(),
      };
    }

    const runtime = this.getRuntime(toolId);
    if (
      (!runtime.backendProcess || runtime.backendProcess.exitCode !== null) &&
      (!runtime.sidecarProcess || runtime.sidecarProcess.exitCode !== null)
    ) {
      const snapshot = {
        status: 'stopped' as const,
        message: 'Runtime is already stopped.',
        updatedAt: now(),
      };
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

  async restart(toolId: ToolId, config: ToolConfigFile['tools'][ToolId]): Promise<ToolRuntimeSnapshot> {
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
        /* wait until next poll */
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out waiting for ${component} on port ${port}.`);
  }
}

let runtimeManager: ToolRuntimeManager | null = null;

export function getToolRuntimeManager(projectRoot: string) {
  runtimeManager ??= new ToolRuntimeManager(projectRoot);
  return runtimeManager;
}
