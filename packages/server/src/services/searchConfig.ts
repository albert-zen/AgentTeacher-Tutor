import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface SearchConfig {
  enabled: boolean;
  provider: 'searxng';
  baseURL: string;
  defaultMaxResults: number;
  timeoutMs: number;
  allowedCategories: string[];
  allowedEngines: string[];
  persistResultsByDefault: boolean;
}

export type SessionSearchConfigOverride = Partial<Pick<SearchConfig, 'enabled'>>;

export const defaultSearchConfig: SearchConfig = {
  enabled: false,
  provider: 'searxng',
  baseURL: 'http://127.0.0.1:8080',
  defaultMaxResults: 5,
  timeoutMs: 8000,
  allowedCategories: ['general', 'it', 'science', 'news'],
  allowedEngines: [],
  persistResultsByDefault: false,
};

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(path: string, value: unknown) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function globalSearchConfigPath(dataDir: string) {
  return join(dataDir, 'search-config.json');
}

function sessionSearchConfigPath(dataDir: string, sessionId: string) {
  return join(dataDir, sessionId, 'search-config.json');
}

export function loadSearchConfig(dataDir: string, sessionId?: string): SearchConfig {
  const globalConfig = readJsonFile<Partial<SearchConfig>>(globalSearchConfigPath(dataDir)) ?? {};
  const sessionConfig = sessionId ? loadSessionSearchConfigOverride(dataDir, sessionId) ?? {} : {};
  return {
    ...defaultSearchConfig,
    ...globalConfig,
    ...sessionConfig,
  };
}

export function saveSearchConfig(dataDir: string, partial: Partial<SearchConfig>): SearchConfig {
  const next = {
    ...loadSearchConfig(dataDir),
    ...partial,
    provider: 'searxng' as const,
  };
  writeJsonFile(globalSearchConfigPath(dataDir), next);
  return next;
}

export function loadSessionSearchConfigOverride(dataDir: string, sessionId: string): SessionSearchConfigOverride | null {
  return readJsonFile<SessionSearchConfigOverride>(sessionSearchConfigPath(dataDir, sessionId));
}

export function saveSessionSearchConfig(
  dataDir: string,
  sessionId: string,
  partial: SessionSearchConfigOverride,
): SessionSearchConfigOverride {
  const next = {
    ...(loadSessionSearchConfigOverride(dataDir, sessionId) ?? {}),
    ...partial,
  };
  writeJsonFile(sessionSearchConfigPath(dataDir, sessionId), next);
  return next;
}

export function clearSessionSearchConfig(dataDir: string, sessionId: string) {
  rmSync(sessionSearchConfigPath(dataDir, sessionId), { force: true });
}
