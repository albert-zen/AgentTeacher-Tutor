import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { ToolId, ToolRuntimeMode } from './toolDefinitions.js';

export interface ReadWriteToolSettings {
  runtimeMode: 'builtin';
}

export interface WebSearchToolSettings {
  runtimeMode: 'local' | 'external';
  localProvider: 'duckduckgo';
  sidecar: {
    port: number;
  };
  backend: {
    port: number;
  };
  externalBaseURL: string;
  timeoutMs: number;
  defaultMaxResults: number;
  allowedCategories: string[];
  allowedEngines: string[];
  persistResultsByDefault: boolean;
}

export interface BrowserToolSettings {
  runtimeMode: 'managed' | 'external';
}

export interface ToolConfigFile {
  version: 1;
  tools: {
    read_file: ReadWriteToolSettings;
    write_file: ReadWriteToolSettings;
    fetch_url: ReadWriteToolSettings;
    web_search: WebSearchToolSettings;
    browser: BrowserToolSettings;
  };
}

export const defaultToolConfig: ToolConfigFile = {
  version: 1,
  tools: {
    read_file: { runtimeMode: 'builtin' },
    write_file: { runtimeMode: 'builtin' },
    fetch_url: { runtimeMode: 'builtin' },
    web_search: {
      runtimeMode: 'local',
      localProvider: 'duckduckgo',
      sidecar: { port: 18080 },
      backend: { port: 18081 },
      externalBaseURL: 'http://127.0.0.1:8080',
      timeoutMs: 8000,
      defaultMaxResults: 5,
      allowedCategories: ['general', 'it', 'science', 'news'],
      allowedEngines: [],
      persistResultsByDefault: false,
    },
    browser: { runtimeMode: 'managed' },
  },
};

function configPath(dataDir: string) {
  return join(dataDir, 'tool-config.json');
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  if (Array.isArray(base) || Array.isArray(patch) || typeof base !== 'object' || typeof patch !== 'object') {
    return (patch as T) ?? base;
  }

  const next = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    const existing = next[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      next[key] = deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else if (value !== undefined) {
      next[key] = value;
    }
  }
  return next as T;
}

function normalizeToolConfig(config: ToolConfigFile): ToolConfigFile {
  const raw = config.tools.web_search as WebSearchToolSettings & {
    runtimeMode?: ToolRuntimeMode;
    localProvider?: 'duckduckgo';
    sidecar?: { port?: number };
    backend?: { port?: number };
    externalBaseURL?: string;
    timeoutMs?: number;
    defaultMaxResults?: number;
    allowedCategories?: string[];
    allowedEngines?: string[];
    persistResultsByDefault?: boolean;
  };
  const legacyRuntimeMode = raw?.runtimeMode as ToolRuntimeMode | undefined;
  const browserRaw = config.tools.browser ?? defaultToolConfig.tools.browser;

  return {
    version: 1,
    tools: {
      read_file: { runtimeMode: 'builtin' },
      write_file: { runtimeMode: 'builtin' },
      fetch_url: { runtimeMode: 'builtin' },
      web_search: {
        runtimeMode:
          legacyRuntimeMode === 'managed'
            ? 'local'
            : ((legacyRuntimeMode as 'local' | 'external' | undefined) ??
              defaultToolConfig.tools.web_search.runtimeMode),
        localProvider: raw?.localProvider ?? defaultToolConfig.tools.web_search.localProvider,
        sidecar: {
          port: raw?.sidecar?.port ?? defaultToolConfig.tools.web_search.sidecar.port,
        },
        backend: {
          port: raw?.backend?.port ?? defaultToolConfig.tools.web_search.backend.port,
        },
        externalBaseURL: raw?.externalBaseURL ?? defaultToolConfig.tools.web_search.externalBaseURL,
        timeoutMs: raw?.timeoutMs ?? defaultToolConfig.tools.web_search.timeoutMs,
        defaultMaxResults: raw?.defaultMaxResults ?? defaultToolConfig.tools.web_search.defaultMaxResults,
        allowedCategories: raw?.allowedCategories ?? defaultToolConfig.tools.web_search.allowedCategories,
        allowedEngines: raw?.allowedEngines ?? defaultToolConfig.tools.web_search.allowedEngines,
        persistResultsByDefault:
          raw?.persistResultsByDefault ?? defaultToolConfig.tools.web_search.persistResultsByDefault,
      },
      browser: {
        runtimeMode: browserRaw.runtimeMode ?? defaultToolConfig.tools.browser.runtimeMode,
      },
    },
  };
}

export function loadToolConfig(dataDir: string): ToolConfigFile {
  const current = readJson<Partial<ToolConfigFile>>(configPath(dataDir));
  const normalized = normalizeToolConfig(deepMerge(defaultToolConfig, current ?? {}));
  if (!current || JSON.stringify(current) !== JSON.stringify(normalized)) {
    writeJson(configPath(dataDir), normalized);
  }
  return normalized;
}

export function saveToolConfig(dataDir: string, patch: Partial<ToolConfigFile>): ToolConfigFile {
  const next = normalizeToolConfig(deepMerge(loadToolConfig(dataDir), patch));
  writeJson(configPath(dataDir), next);
  return next;
}

export function updateToolConfig(
  dataDir: string,
  toolId: ToolId,
  patch: Partial<ToolConfigFile['tools'][ToolId]>,
): ToolConfigFile {
  const current = loadToolConfig(dataDir);
  const next = normalizeToolConfig({
    ...current,
    tools: {
      ...current.tools,
      [toolId]: deepMerge(current.tools[toolId], patch),
    },
  } as ToolConfigFile);
  writeJson(configPath(dataDir), next);
  return next;
}
