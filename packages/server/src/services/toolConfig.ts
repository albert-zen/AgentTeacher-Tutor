import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ToolId, ToolRuntimeMode } from './toolDefinitions.js';

export interface BaseToolSettings {
  enabledByDefault: boolean;
  runtimeMode: ToolRuntimeMode;
}

export interface ReadWriteToolSettings extends BaseToolSettings {
  runtimeMode: 'builtin';
}

export interface WebSearchToolSettings extends BaseToolSettings {
  runtimeMode: 'managed' | 'external';
  sidecar: {
    port: number;
  };
  backend: {
    port: number;
  };
  upstream: {
    provider: 'searxng';
    remoteBaseURL: string;
  };
  timeoutMs: number;
  defaultMaxResults: number;
  allowedCategories: string[];
  allowedEngines: string[];
  persistResultsByDefault: boolean;
}

export interface BrowserToolSettings extends BaseToolSettings {
  runtimeMode: 'managed' | 'external';
}

export interface ToolConfigFile {
  version: 1;
  tools: {
    read_file: ReadWriteToolSettings;
    write_file: ReadWriteToolSettings;
    web_search: WebSearchToolSettings;
    browser: BrowserToolSettings;
  };
}

export interface ToolOverride {
  enabled?: boolean;
}

export interface SessionContextConfig {
  profileBlockIds?: string[];
  toolOverrides?: Partial<Record<ToolId, ToolOverride>>;
}

export const defaultToolConfig: ToolConfigFile = {
  version: 1,
  tools: {
    read_file: {
      enabledByDefault: true,
      runtimeMode: 'builtin',
    },
    write_file: {
      enabledByDefault: true,
      runtimeMode: 'builtin',
    },
    web_search: {
      enabledByDefault: false,
      runtimeMode: 'managed',
      sidecar: {
        port: 18080,
      },
      backend: {
        port: 18081,
      },
      upstream: {
        provider: 'searxng',
        remoteBaseURL: 'http://127.0.0.1:8080',
      },
      timeoutMs: 8000,
      defaultMaxResults: 5,
      allowedCategories: ['general', 'it', 'science', 'news'],
      allowedEngines: [],
      persistResultsByDefault: false,
    },
    browser: {
      enabledByDefault: false,
      runtimeMode: 'managed',
    },
  },
};

function toolConfigPath(dataDir: string) {
  return join(dataDir, 'tool-config.json');
}

function legacySearchConfigPath(dataDir: string) {
  return join(dataDir, 'search-config.json');
}

function sessionContextConfigPath(dataDir: string, sessionId: string) {
  return join(dataDir, sessionId, 'context-config.json');
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  if (Array.isArray(base) || Array.isArray(patch) || typeof base !== 'object' || typeof patch !== 'object') {
    return (patch as T) ?? base;
  }

  const result = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    const existing = result[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      result[key] = deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
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
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function migrateLegacySearchConfig(dataDir: string): Partial<ToolConfigFile> | null {
  const legacy = readJson<{
    enabled?: boolean;
    provider?: 'searxng';
    baseURL?: string;
    defaultMaxResults?: number;
    timeoutMs?: number;
    allowedCategories?: string[];
    allowedEngines?: string[];
    persistResultsByDefault?: boolean;
  }>(legacySearchConfigPath(dataDir));

  if (!legacy) return null;

  return {
    version: 1,
    tools: {
      ...defaultToolConfig.tools,
      web_search: {
        ...defaultToolConfig.tools.web_search,
        enabledByDefault: legacy.enabled ?? defaultToolConfig.tools.web_search.enabledByDefault,
        upstream: {
          provider: legacy.provider ?? defaultToolConfig.tools.web_search.upstream.provider,
          remoteBaseURL: legacy.baseURL ?? defaultToolConfig.tools.web_search.upstream.remoteBaseURL,
        },
        defaultMaxResults: legacy.defaultMaxResults ?? defaultToolConfig.tools.web_search.defaultMaxResults,
        timeoutMs: legacy.timeoutMs ?? defaultToolConfig.tools.web_search.timeoutMs,
        allowedCategories: legacy.allowedCategories ?? defaultToolConfig.tools.web_search.allowedCategories,
        allowedEngines: legacy.allowedEngines ?? defaultToolConfig.tools.web_search.allowedEngines,
        persistResultsByDefault:
          legacy.persistResultsByDefault ?? defaultToolConfig.tools.web_search.persistResultsByDefault,
      },
    },
  };
}

export function loadToolConfig(dataDir: string): ToolConfigFile {
  const current = readJson<Partial<ToolConfigFile>>(toolConfigPath(dataDir));
  const legacy = migrateLegacySearchConfig(dataDir);
  return deepMerge(defaultToolConfig, current ?? legacy ?? {});
}

export function saveToolConfig(dataDir: string, config: Partial<ToolConfigFile>): ToolConfigFile {
  const next = deepMerge(loadToolConfig(dataDir), config);
  writeJson(toolConfigPath(dataDir), next);
  return next;
}

export function updateToolConfig(
  dataDir: string,
  toolId: ToolId,
  patch: Partial<ToolConfigFile['tools'][ToolId]>,
): ToolConfigFile {
  const current = loadToolConfig(dataDir);
  const next = {
    ...current,
    tools: {
      ...current.tools,
      [toolId]: deepMerge(current.tools[toolId], patch),
    },
  } as ToolConfigFile;
  writeJson(toolConfigPath(dataDir), next);
  return next;
}

export function loadSessionContextConfig(dataDir: string, sessionId: string): SessionContextConfig {
  return readJson<SessionContextConfig>(sessionContextConfigPath(dataDir, sessionId)) ?? {};
}

export function saveSessionContextConfig(dataDir: string, sessionId: string, config: SessionContextConfig): SessionContextConfig {
  const current = loadSessionContextConfig(dataDir, sessionId);
  const next = deepMerge(current, config);
  writeJson(sessionContextConfigPath(dataDir, sessionId), next);
  return next;
}

export function updateSessionToolOverride(
  dataDir: string,
  sessionId: string,
  toolId: ToolId,
  override: ToolOverride | null,
): SessionContextConfig {
  const current = loadSessionContextConfig(dataDir, sessionId);
  const toolOverrides = { ...(current.toolOverrides ?? {}) };
  if (override && override.enabled !== undefined) {
    toolOverrides[toolId] = { enabled: override.enabled };
  } else {
    delete toolOverrides[toolId];
  }

  const next: SessionContextConfig = {
    ...current,
    toolOverrides: Object.keys(toolOverrides).length > 0 ? toolOverrides : undefined,
  };
  writeJson(sessionContextConfigPath(dataDir, sessionId), next);
  return next;
}

export function resolveToolEnabled(
  globalConfig: ToolConfigFile,
  sessionConfig: SessionContextConfig,
  toolId: ToolId,
): boolean {
  const override = sessionConfig.toolOverrides?.[toolId]?.enabled;
  if (override !== undefined) return override;
  return globalConfig.tools[toolId].enabledByDefault;
}
