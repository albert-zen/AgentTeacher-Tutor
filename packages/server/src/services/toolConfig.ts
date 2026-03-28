import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { ToolId, ToolRuntimeMode } from './toolDefinitions.js';
import {
  loadSessionContext,
  loadSessionDraft,
  saveSessionContext,
  saveSessionDraft,
  type SessionContextManifest,
  type SessionDraftManifest,
} from './sessionDraftService.js';

export interface ReadWriteToolSettings {
  runtimeMode: 'builtin';
  enabledByDefault?: boolean;
}

export interface WebSearchToolSettings {
  runtimeMode: 'local' | 'external';
  enabledByDefault?: boolean;
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
  enabledByDefault?: boolean;
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
    read_file: { runtimeMode: 'builtin', enabledByDefault: true },
    write_file: { runtimeMode: 'builtin', enabledByDefault: true },
    fetch_url: { runtimeMode: 'builtin', enabledByDefault: true },
    web_search: {
      enabledByDefault: false,
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
    browser: { runtimeMode: 'managed', enabledByDefault: false },
  },
};

function configPath(dataDir: string) {
  return join(dataDir, 'tool-config.json');
}

function legacySearchConfigPath(dataDir: string) {
  return join(dataDir, 'search-config.json');
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

function migrateLegacySearchConfig(dataDir: string): Partial<ToolConfigFile> | null {
  const legacy = readJson<{
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
        runtimeMode: legacy.baseURL ? 'external' : defaultToolConfig.tools.web_search.runtimeMode,
        externalBaseURL: legacy.baseURL ?? defaultToolConfig.tools.web_search.externalBaseURL,
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

function normalizeToolConfig(config: ToolConfigFile): ToolConfigFile {
  const raw = config.tools.web_search as WebSearchToolSettings & {
    upstream?: { remoteBaseURL?: string };
    runtimeMode?: ToolRuntimeMode;
  };
  const legacyRuntimeMode = raw.runtimeMode as ToolRuntimeMode | undefined;

  return {
    version: 1,
    tools: {
      read_file: { runtimeMode: 'builtin' },
      write_file: { runtimeMode: 'builtin' },
      fetch_url: { runtimeMode: 'builtin' },
      web_search: {
        ...defaultToolConfig.tools.web_search,
        ...raw,
        runtimeMode:
          legacyRuntimeMode === 'managed'
            ? 'local'
            : ((legacyRuntimeMode as 'local' | 'external' | undefined) ?? defaultToolConfig.tools.web_search.runtimeMode),
        sidecar: {
          ...defaultToolConfig.tools.web_search.sidecar,
          ...(raw.sidecar ?? {}),
        },
        backend: {
          ...defaultToolConfig.tools.web_search.backend,
          ...(raw.backend ?? {}),
        },
        externalBaseURL:
          raw.upstream?.remoteBaseURL ?? raw.externalBaseURL ?? defaultToolConfig.tools.web_search.externalBaseURL,
        allowedCategories: raw.allowedCategories ?? defaultToolConfig.tools.web_search.allowedCategories,
        allowedEngines: raw.allowedEngines ?? defaultToolConfig.tools.web_search.allowedEngines,
      },
      browser: {
        ...defaultToolConfig.tools.browser,
        ...(config.tools.browser ?? {}),
      },
    },
  };
}

export function loadToolConfig(dataDir: string): ToolConfigFile {
  const current = readJson<Partial<ToolConfigFile>>(configPath(dataDir));
  const legacy = migrateLegacySearchConfig(dataDir);
  const normalized = normalizeToolConfig(deepMerge(defaultToolConfig, current ?? legacy ?? {}));
  const enabledTools = new Set(loadSessionDraft(dataDir).manifest.enabledTools);
  for (const toolId of Object.keys(normalized.tools) as ToolId[]) {
    (normalized.tools[toolId] as { enabledByDefault?: boolean }).enabledByDefault = enabledTools.has(toolId);
  }
  return normalized;
}

export function saveToolConfig(dataDir: string, patch: Partial<ToolConfigFile>): ToolConfigFile {
  const enabledPatch = (patch.tools ?? {}) as Partial<Record<ToolId, { enabledByDefault?: boolean }>>;
  const draft = loadSessionDraft(dataDir);
  const enabledTools = new Set(draft.manifest.enabledTools);
  for (const toolId of Object.keys(enabledPatch) as ToolId[]) {
    const enabled = enabledPatch[toolId]?.enabledByDefault;
    if (enabled === true) enabledTools.add(toolId);
    if (enabled === false) enabledTools.delete(toolId);
  }
  if (Object.keys(enabledPatch).length > 0) {
    saveSessionDraft(dataDir, {
      ...draft,
      manifest: {
        ...draft.manifest,
        enabledTools: Array.from(enabledTools),
      },
    });
  }
  const next = normalizeToolConfig(deepMerge(loadToolConfig(dataDir), patch));
  writeJson(configPath(dataDir), next);
  return next;
}

export function updateToolConfig(
  dataDir: string,
  toolId: ToolId,
  patch: Partial<ToolConfigFile['tools'][ToolId]>,
): ToolConfigFile {
  if ('enabledByDefault' in patch && typeof patch.enabledByDefault === 'boolean') {
    const draft = loadSessionDraft(dataDir);
    const enabledTools = new Set(draft.manifest.enabledTools);
    if (patch.enabledByDefault) enabledTools.add(toolId);
    else enabledTools.delete(toolId);
    saveSessionDraft(dataDir, {
      ...draft,
      manifest: {
        ...draft.manifest,
        enabledTools: Array.from(enabledTools),
      },
    });
  }

  const { enabledByDefault: _enabledByDefault, ...configPatch } = patch as Partial<ToolConfigFile['tools'][ToolId]> & {
    enabledByDefault?: boolean;
  };
  const current = loadToolConfig(dataDir);
  const next = normalizeToolConfig({
    ...current,
    tools: {
      ...current.tools,
      [toolId]: deepMerge(current.tools[toolId], configPatch),
    },
  } as ToolConfigFile);
  writeJson(configPath(dataDir), next);
  return next;
}

export interface ToolOverride {
  enabled?: boolean;
}

export interface SessionContextConfig {
  profileBlockIds?: string[];
  toolOverrides?: Partial<Record<ToolId, ToolOverride>>;
}

function manifestToLegacyConfig(
  manifest: SessionDraftManifest | SessionContextManifest,
  dataDir: string,
): SessionContextConfig {
  const globalEnabled = new Set(loadSessionDraft(dataDir).manifest.enabledTools);
  const toolOverrides: Partial<Record<ToolId, ToolOverride>> = {};
  for (const toolId of ['read_file', 'write_file', 'fetch_url', 'web_search', 'browser'] as ToolId[]) {
    const enabled = manifest.enabledTools.includes(toolId);
    if (enabled !== globalEnabled.has(toolId)) {
      toolOverrides[toolId] = { enabled };
    }
  }
  return {
    profileBlockIds:
      manifest.profileSelection.mode === 'explicit' ? manifest.profileSelection.blockIds : undefined,
    toolOverrides: Object.keys(toolOverrides).length > 0 ? toolOverrides : undefined,
  };
}

export function loadSessionContextConfig(dataDir: string, sessionId: string): SessionContextConfig {
  return manifestToLegacyConfig(loadSessionContext(dataDir, sessionId), dataDir);
}

export function loadSessionTemplateConfig(dataDir: string): SessionContextConfig {
  return manifestToLegacyConfig(loadSessionDraft(dataDir).manifest, dataDir);
}

export function saveSessionContextConfig(dataDir: string, sessionId: string, config: SessionContextConfig): SessionContextConfig {
  const current = loadSessionContext(dataDir, sessionId);
  const baseEnabledTools = loadSessionDraft(dataDir).manifest.enabledTools;
  const nextEnabledTools = applyLegacyOverrides(baseEnabledTools, config.toolOverrides);
  saveSessionContext(dataDir, sessionId, {
    ...current,
    profileSelection:
      config.profileBlockIds === undefined
        ? current.profileSelection
        : { mode: 'explicit', blockIds: config.profileBlockIds },
    enabledTools: nextEnabledTools,
  });
  return loadSessionContextConfig(dataDir, sessionId);
}

export function saveSessionTemplateConfig(dataDir: string, config: SessionContextConfig): SessionContextConfig {
  const current = loadSessionDraft(dataDir);
  const nextEnabledTools = applyLegacyOverrides(current.manifest.enabledTools, config.toolOverrides);
  saveSessionDraft(dataDir, {
    ...current,
    manifest: {
      ...current.manifest,
      profileSelection:
        config.profileBlockIds === undefined
          ? current.manifest.profileSelection
          : { mode: 'explicit', blockIds: config.profileBlockIds },
      enabledTools: nextEnabledTools,
    },
  });
  return loadSessionTemplateConfig(dataDir);
}

function applyLegacyOverrides(baseEnabledTools: ToolId[], toolOverrides?: Partial<Record<ToolId, ToolOverride>>): ToolId[] {
  const next = new Set(baseEnabledTools);
  for (const toolId of Object.keys(toolOverrides ?? {}) as ToolId[]) {
    const enabled = toolOverrides?.[toolId]?.enabled;
    if (enabled === true) next.add(toolId);
    if (enabled === false) next.delete(toolId);
  }
  return Array.from(next);
}

export function updateSessionToolOverride(
  dataDir: string,
  sessionId: string,
  toolId: ToolId,
  override: ToolOverride | null,
): SessionContextConfig {
  const current = loadSessionContext(dataDir, sessionId);
  const next = new Set(current.enabledTools);
  const inherited = loadSessionDraft(dataDir).manifest.enabledTools.includes(toolId);
  if (override?.enabled === true) next.add(toolId);
  else if (override?.enabled === false) next.delete(toolId);
  else if (inherited) next.add(toolId);
  else next.delete(toolId);

  saveSessionContext(dataDir, sessionId, {
    ...current,
    enabledTools: Array.from(next),
  });
  return loadSessionContextConfig(dataDir, sessionId);
}

export function resolveToolEnabled(
  globalConfig: ToolConfigFile,
  sessionConfig: SessionContextConfig,
  toolId: ToolId,
): boolean {
  const override = sessionConfig.toolOverrides?.[toolId]?.enabled;
  if (override !== undefined) return override;
  return Boolean((globalConfig.tools[toolId] as { enabledByDefault?: boolean }).enabledByDefault);
}
