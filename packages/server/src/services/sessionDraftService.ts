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
const SESSION_CONTEXT_MANIFEST = 'session-context.json';

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
  return Array.from(new Set(toolIds ?? DEFAULT_ENABLED_TOOLS));
}

function normalizeProfileSelection(selection: ProfileSelection | undefined): ProfileSelection {
  if (!selection || selection.mode === 'inherit_all') {
    return { mode: 'inherit_all' };
  }

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
  inheritedEnabledTools?: ToolId[],
): SessionContextManifest {
  return {
    version: 1,
    profileSelection: normalizeProfileSelection(manifest?.profileSelection),
    enabledTools: normalizeToolIds(manifest?.enabledTools ?? inheritedEnabledTools),
  };
}

function createDefaultDraft(): SessionDraft {
  return {
    manifest: normalizeDraftManifest(null),
    sessionPrompt: '',
  };
}

export function loadSessionDraft(dataDir: string): SessionDraft {
  const manifest = readJson<Partial<SessionDraftManifest>>(draftManifestPath(dataDir));
  const draft: SessionDraft = {
    manifest: normalizeDraftManifest(manifest),
    sessionPrompt: readText(draftPromptPath(dataDir)),
  };

  if (!manifest || !existsSync(draftPromptPath(dataDir))) {
    saveSessionDraft(dataDir, draft);
  }

  return draft;
}

export function saveSessionDraft(dataDir: string, draft: SessionDraft): SessionDraft {
  const normalized: SessionDraft = {
    manifest: normalizeDraftManifest(draft.manifest),
    sessionPrompt: draft.sessionPrompt ?? '',
  };
  writeJson(draftManifestPath(dataDir), normalized.manifest);
  writeText(draftPromptPath(dataDir), normalized.sessionPrompt);
  return normalized;
}

export function updateSessionDraft(dataDir: string, patch: Partial<SessionDraft>): SessionDraft {
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

  const inherited = loadSessionDraft(dataDir);
  const bootstrap = normalizeSessionContextManifest(
    {
      profileSelection: inherited.manifest.profileSelection,
      enabledTools: inherited.manifest.enabledTools,
    },
    inherited.manifest.enabledTools,
  );
  saveSessionContext(dataDir, sessionId, bootstrap);
  return bootstrap;
}

export function saveSessionContext(
  dataDir: string,
  sessionId: string,
  manifest: SessionContextManifest,
): SessionContextManifest {
  const normalized = normalizeSessionContextManifest(manifest);
  writeJson(sessionContextPath(dataDir, sessionId), normalized);
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

export function profileSelectionToBlockIds(selection: ProfileSelection): string[] | undefined {
  if (selection.mode === 'inherit_all') return undefined;
  return selection.blockIds;
}

export function createDefaultSessionDraft(): SessionDraft {
  return createDefaultDraft();
}
