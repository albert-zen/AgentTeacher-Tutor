import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { ToolId } from './toolDefinitions.js';

export type ProfileSelection =
  | { mode: 'inherit_all' }
  | { mode: 'explicit'; blockIds: string[] };

export interface SessionDraftManifest {
  version: 1;
  profileSelection: ProfileSelection;
  enabledTools: ToolId[];
}

export interface SessionContextManifest {
  version: 1;
  profileSelection: ProfileSelection;
  enabledTools: ToolId[];
}

export interface SessionDraft {
  manifest: SessionDraftManifest;
  sessionPrompt: string;
}

const SESSION_DRAFT_DIR = 'session-draft';
const SESSION_DRAFT_MANIFEST = 'manifest.json';
const SESSION_DRAFT_PROMPT = 'session-prompt.md';
const LEGACY_TEMPLATE_CONFIG = 'session-template-config.json';
const LEGACY_SESSION_PROMPT_DRAFT = 'session-prompt-draft.md';
const SESSION_CONTEXT_MANIFEST = 'session-context.json';
const LEGACY_SESSION_CONTEXT = 'context-config.json';

const DEFAULT_ENABLED_TOOLS: ToolId[] = ['read_file', 'write_file', 'fetch_url'];

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

function readText(path: string): string {
  if (!existsSync(path)) return '';
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}

function writeText(path: string, value: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function draftManifestPath(dataDir: string) {
  return join(dataDir, SESSION_DRAFT_DIR, SESSION_DRAFT_MANIFEST);
}

function draftPromptPath(dataDir: string) {
  return join(dataDir, SESSION_DRAFT_DIR, SESSION_DRAFT_PROMPT);
}

function sessionContextPath(dataDir: string, sessionId: string) {
  return join(dataDir, sessionId, SESSION_CONTEXT_MANIFEST);
}

function normalizeToolIds(toolIds: ToolId[] | undefined): ToolId[] {
  if (!toolIds) return [...DEFAULT_ENABLED_TOOLS];
  return Array.from(new Set(toolIds));
}

function normalizeProfileSelection(selection: ProfileSelection | undefined): ProfileSelection {
  if (!selection) return { mode: 'inherit_all' };
  if (selection.mode === 'inherit_all') return selection;
  return {
    mode: 'explicit',
    blockIds: Array.from(new Set(selection.blockIds ?? [])),
  };
}

function normalizeDraftManifest(manifest: Partial<SessionDraftManifest> | null): SessionDraftManifest {
  return {
    version: 1,
    profileSelection: normalizeProfileSelection(manifest?.profileSelection),
    enabledTools: normalizeToolIds(manifest?.enabledTools),
  };
}

function normalizeSessionContextManifest(
  manifest: Partial<SessionContextManifest> | null,
): SessionContextManifest {
  return {
    version: 1,
    profileSelection: normalizeProfileSelection(manifest?.profileSelection),
    enabledTools: normalizeToolIds(manifest?.enabledTools),
  };
}

function legacyEnabledToolsFromConfig(dataDir: string): ToolId[] {
  const raw = readJson<{
    tools?: Partial<Record<ToolId, { enabledByDefault?: boolean }>>;
  }>(join(dataDir, 'tool-config.json'));
  const legacySearch = readJson<{ enabled?: boolean }>(join(dataDir, 'search-config.json'));

  if (!raw?.tools) {
    const enabled = new Set<ToolId>(DEFAULT_ENABLED_TOOLS);
    if (legacySearch?.enabled) enabled.add('web_search');
    return Array.from(enabled);
  }

  const enabled = new Set<ToolId>();
  for (const toolId of ['read_file', 'write_file', 'fetch_url', 'web_search', 'browser'] as ToolId[]) {
    if (raw.tools[toolId]?.enabledByDefault) {
      enabled.add(toolId);
    }
  }
  if (legacySearch?.enabled) {
    enabled.add('web_search');
  }
  return enabled.size > 0 ? Array.from(enabled) : [...DEFAULT_ENABLED_TOOLS];
}

function legacyProfileSelection(profileBlockIds: string[] | undefined): ProfileSelection {
  if (profileBlockIds === undefined) {
    return { mode: 'inherit_all' };
  }
  return {
    mode: 'explicit',
    blockIds: profileBlockIds,
  };
}

function applyLegacyToolOverrides(
  baseEnabledTools: ToolId[],
  toolOverrides?: Partial<Record<ToolId, { enabled?: boolean }>>,
): ToolId[] {
  const next = new Set<ToolId>(baseEnabledTools);
  for (const toolId of Object.keys(toolOverrides ?? {}) as ToolId[]) {
    const enabled = toolOverrides?.[toolId]?.enabled;
    if (enabled === true) next.add(toolId);
    if (enabled === false) next.delete(toolId);
  }
  return Array.from(next);
}

export function loadSessionDraft(dataDir: string): SessionDraft {
  const manifestPath = draftManifestPath(dataDir);
  const promptPath = draftPromptPath(dataDir);

  const manifest = readJson<Partial<SessionDraftManifest>>(manifestPath);
  if (manifest) {
    return {
      manifest: normalizeDraftManifest(manifest),
      sessionPrompt: readText(promptPath),
    };
  }

  const legacyTemplate = readJson<{
    profileBlockIds?: string[];
    toolOverrides?: Partial<Record<ToolId, { enabled?: boolean }>>;
  }>(join(dataDir, LEGACY_TEMPLATE_CONFIG));

  const legacyEnabledTools = applyLegacyToolOverrides(
    legacyEnabledToolsFromConfig(dataDir),
    legacyTemplate?.toolOverrides,
  );

  const migrated: SessionDraft = {
    manifest: normalizeDraftManifest({
      profileSelection: legacyProfileSelection(legacyTemplate?.profileBlockIds),
      enabledTools: legacyEnabledTools,
    }),
    sessionPrompt: readText(join(dataDir, LEGACY_SESSION_PROMPT_DRAFT)),
  };

  saveSessionDraft(dataDir, migrated);
  return migrated;
}

export function saveSessionDraft(dataDir: string, draft: SessionDraft): SessionDraft {
  const normalized: SessionDraft = {
    manifest: normalizeDraftManifest(draft.manifest),
    sessionPrompt: draft.sessionPrompt ?? '',
  };
  writeJson(draftManifestPath(dataDir), normalized.manifest);
  writeText(draftPromptPath(dataDir), normalized.sessionPrompt);
  writeJson(join(dataDir, LEGACY_TEMPLATE_CONFIG), {
    profileBlockIds: profileSelectionToLegacyBlockIds(normalized.manifest.profileSelection),
  });
  writeText(join(dataDir, LEGACY_SESSION_PROMPT_DRAFT), normalized.sessionPrompt);
  return normalized;
}

export function updateSessionDraft(
  dataDir: string,
  patch: Partial<SessionDraft>,
): SessionDraft {
  const current = loadSessionDraft(dataDir);
  return saveSessionDraft(dataDir, {
    manifest: {
      ...current.manifest,
      ...(patch.manifest ?? {}),
    },
    sessionPrompt: patch.sessionPrompt ?? current.sessionPrompt,
  });
}

export function loadSessionContext(dataDir: string, sessionId: string): SessionContextManifest {
  const current = readJson<Partial<SessionContextManifest>>(sessionContextPath(dataDir, sessionId));
  if (current) {
    return normalizeSessionContextManifest(current);
  }

  const legacy = readJson<{
    profileBlockIds?: string[];
    toolOverrides?: Partial<Record<ToolId, { enabled?: boolean }>>;
  }>(join(dataDir, sessionId, LEGACY_SESSION_CONTEXT));

  const inheritedEnabledTools = loadSessionDraft(dataDir).manifest.enabledTools;

  if (!legacy) {
    return normalizeSessionContextManifest({
      profileSelection: { mode: 'inherit_all' },
      enabledTools: inheritedEnabledTools,
    });
  }

  const migrated = normalizeSessionContextManifest({
    profileSelection: legacyProfileSelection(legacy?.profileBlockIds),
    enabledTools: applyLegacyToolOverrides(inheritedEnabledTools, legacy?.toolOverrides),
  });
  saveSessionContext(dataDir, sessionId, migrated);
  return migrated;
}

export function saveSessionContext(
  dataDir: string,
  sessionId: string,
  manifest: SessionContextManifest,
): SessionContextManifest {
  const normalized = normalizeSessionContextManifest(manifest);
  writeJson(sessionContextPath(dataDir, sessionId), normalized);
  writeJson(join(dataDir, sessionId, LEGACY_SESSION_CONTEXT), {
    profileBlockIds: profileSelectionToLegacyBlockIds(normalized.profileSelection),
  });
  return normalized;
}

export function updateSessionContext(
  dataDir: string,
  sessionId: string,
  patch: Partial<SessionContextManifest>,
): SessionContextManifest {
  const current = loadSessionContext(dataDir, sessionId);
  return saveSessionContext(dataDir, sessionId, {
    ...current,
    ...patch,
  });
}

export function materializeDraftToSession(
  dataDir: string,
  sessionId: string,
  draft?: SessionDraft,
): SessionContextManifest {
  const currentDraft = draft ?? loadSessionDraft(dataDir);
  const manifest = saveSessionContext(dataDir, sessionId, {
    version: 1,
    profileSelection: currentDraft.manifest.profileSelection,
    enabledTools: currentDraft.manifest.enabledTools,
  });

  const prompt = currentDraft.sessionPrompt.trim();
  if (prompt) {
    writeText(join(dataDir, sessionId, 'session-prompt.md'), currentDraft.sessionPrompt);
  }

  return manifest;
}

export function profileSelectionToLegacyBlockIds(selection: ProfileSelection): string[] | undefined {
  if (selection.mode === 'inherit_all') return undefined;
  return selection.blockIds;
}
