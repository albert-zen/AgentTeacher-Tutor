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

    if (config.runtimeMode === 'managed') {
      try {
        const backendResponse = await ping(`http://127.0.0.1:${webConfig.backend.port}/health`, 1500);
        const sidecarResponse = await ping(`http://127.0.0.1:${webConfig.sidecar.port}/health`, 1500);
        const snapshot = {
          status: backendResponse.ok && sidecarResponse.ok ? ('ready' as const) : ('error' as const),
          message:
            backendResponse.ok && sidecarResponse.ok
              ? `Backend ${webConfig.backend.port} and sidecar ${webConfig.sidecar.port} are ready.`
              : `Managed search stack is unhealthy (backend ${backendResponse.status}, sidecar ${sidecarResponse.status}).`,
          updatedAt: now(),
        };
        this.setSnapshot(toolId, snapshot);
        return snapshot;
      } catch (error: unknown) {
        const message =
          error instanceof Error && error.cause && typeof error.cause === 'object' && 'code' in error.cause
            ? `Managed search stack unavailable: ${(error.cause as { code?: string }).code ?? error.message}`
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
      const response = await ping(webConfig.upstream.remoteBaseURL, 1500);
      const snapshot = {
        status: response.ok ? ('ready' as const) : ('error' as const),
        message: response.ok
          ? `External endpoint reachable: ${webConfig.upstream.remoteBaseURL}`
          : `External endpoint returned ${response.status}.`,
        updatedAt: now(),
      };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    } catch (error: unknown) {
      const snapshot = {
        status: 'error' as const,
        message: error instanceof Error ? error.message : String(error),
        updatedAt: now(),
      };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    }
  }

  async ensureReady(toolId: ToolId, config: ToolConfigFile['tools'][ToolId]): Promise<ToolRuntimeSnapshot> {
    const current = await this.check(toolId, config);
    if (current.status === 'ready' || config.runtimeMode !== 'managed') {
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
    if (runtime.backendProcess && runtime.backendProcess.exitCode === null && runtime.sidecarProcess && runtime.sidecarProcess.exitCode === null) {
      return this.check(toolId, config);
    }

    this.setSnapshot(toolId, {
      status: 'starting',
      message: 'Starting managed search backend and sidecar...',
    });

    const backend = spawn(
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
          SEARCH_REMOTE_BASE_URL: webConfig.upstream.remoteBaseURL,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    runtime.backendProcess = backend;
    backend.stdout.on('data', () => {});
    backend.stderr.on('data', () => {});
    backend.once('exit', (code, signal) => {
      this.setSnapshot(toolId, {
        status: 'stopped',
        message: `Search backend exited${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}.`,
      });
      runtime.backendProcess = null;
    });

    let sidecar: ChildProcess | null = null;

    try {
      await Promise.race([
        this.waitUntilReady(webConfig.backend.port, 4000),
        once(backend, 'error').then(([error]) => {
          throw error;
        }),
      ]);

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
            SEARCH_BACKEND_URL: `http://127.0.0.1:${webConfig.backend.port}`,
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
        this.waitUntilReady(webConfig.sidecar.port, 4000),
        once(sidecar, 'error').then(([error]) => {
          throw error;
        }),
      ]);

      const snapshot = {
        status: 'ready' as const,
        message: `Managed search backend ${webConfig.backend.port} and sidecar ${webConfig.sidecar.port} are ready.`,
        updatedAt: now(),
      };
      this.setSnapshot(toolId, snapshot);
      return snapshot;
    } catch (error: unknown) {
      backend.kill();
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
      message: 'Managed search stack stopped.',
      updatedAt: now(),
    };
    this.setSnapshot(toolId, snapshot);
    return snapshot;
  }

  async restart(toolId: ToolId, config: ToolConfigFile['tools'][ToolId]): Promise<ToolRuntimeSnapshot> {
    await this.stop(toolId, config);
    return this.start(toolId, config);
  }

  private async waitUntilReady(port: number, timeoutMs: number) {
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
    throw new Error(`Timed out waiting for sidecar on port ${port}.`);
  }
}

let runtimeManager: ToolRuntimeManager | null = null;

export function getToolRuntimeManager(projectRoot: string) {
  runtimeManager ??= new ToolRuntimeManager(projectRoot);
  return runtimeManager;
}
