import { loadToolConfig, updateToolConfig, type ToolConfigFile } from './toolConfig.js';
import { getToolRegistry, type ToolId, type ToolRegistryEntry, type ToolRuntimeStatus } from './toolRegistry.js';
import { getToolRuntimeManager } from './toolRuntimeManager.js';
import {
  loadSessionContext,
  loadSessionDraft,
  saveSessionContext,
  saveSessionDraft,
  type SessionContextManifest,
  type SessionDraft,
} from './sessionDraftService.js';

export interface ToolState {
  id: ToolId;
  label: string;
  description: string;
  enabled: boolean;
  exposeToModel: boolean;
  uiVisible: boolean;
  runtimeMode: ToolConfigFile['tools'][ToolId]['runtimeMode'];
  status: ToolRuntimeStatus;
  message?: string;
  config: ToolConfigFile['tools'][ToolId];
}

export interface ToolContext {
  enabledTools: ToolState[];
  visibleTools: ToolState[];
  promptFragments: Array<{ id: ToolId; label: string; content: string }>;
  globalConfig: ToolConfigFile;
  source:
    | { kind: 'draft'; draft: SessionDraft }
    | { kind: 'session'; sessionContext: SessionContextManifest };
}

function enabledToolsSet(toolIds: ToolId[]) {
  return new Set(toolIds);
}

function toToolState(
  definition: ToolRegistryEntry,
  config: ToolConfigFile['tools'][ToolId],
  enabled: boolean,
  status: ToolRuntimeStatus,
  message?: string,
): ToolState {
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    enabled,
    exposeToModel: definition.exposeToModel,
    uiVisible: definition.uiVisible,
    runtimeMode: config.runtimeMode,
    status,
    message,
    config,
  };
}

export function resolveToolContext(dataDir: string, sessionId?: string): ToolContext {
  const registry = getToolRegistry();
  const globalConfig = loadToolConfig(dataDir);
  const runtimeManager = getToolRuntimeManager(dataDir);
  const source = sessionId
    ? { kind: 'session' as const, sessionContext: loadSessionContext(dataDir, sessionId) }
    : { kind: 'draft' as const, draft: loadSessionDraft(dataDir) };
  const enabledSet = enabledToolsSet(
    source.kind === 'session' ? source.sessionContext.enabledTools : source.draft.manifest.enabledTools,
  );

  const states = (Object.keys(registry) as ToolId[]).map((toolId) => {
    const definition = registry[toolId];
    const config = globalConfig.tools[toolId];
    const enabled = enabledSet.has(toolId);
    const snapshot = runtimeManager.getSnapshot(toolId, enabled, config);
    return toToolState(definition, config, enabled, snapshot.status, snapshot.message);
  });

  const visibleTools = states.filter((tool) => tool.uiVisible);
  const enabledTools = states.filter((tool) => tool.enabled && tool.exposeToModel);
  const promptFragments = enabledTools.map((tool) => ({
    id: tool.id,
    label: tool.label,
    content: registry[tool.id].buildPromptFragment(),
  }));

  return {
    enabledTools,
    visibleTools,
    promptFragments,
    globalConfig,
    source,
  };
}

export async function runToolRuntimeAction(
  dataDir: string,
  toolId: ToolId,
  action: 'start' | 'stop' | 'restart' | 'check',
) {
  const context = resolveToolContext(dataDir);
  const tool = context.visibleTools.find((item) => item.id === toolId);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  const runtimeManager = getToolRuntimeManager(dataDir);
  const snapshot =
    action === 'start'
      ? await runtimeManager.start(toolId, tool.config)
      : action === 'stop'
        ? await runtimeManager.stop(toolId, tool.config)
        : action === 'restart'
          ? await runtimeManager.restart(toolId, tool.config)
          : await runtimeManager.check(toolId, tool.config);

  return {
    ...tool,
    status: snapshot.status,
    message: snapshot.message,
  };
}

export async function updateGlobalToolState(
  dataDir: string,
  toolId: ToolId,
  patch: Partial<ToolConfigFile['tools'][ToolId]>,
) {
  updateToolConfig(dataDir, toolId, patch);
  return resolveToolContext(dataDir);
}

export function setDraftToolEnabled(dataDir: string, toolId: ToolId, enabled: boolean) {
  const draft = loadSessionDraft(dataDir);
  const enabledTools = new Set(draft.manifest.enabledTools);
  if (enabled) enabledTools.add(toolId);
  else enabledTools.delete(toolId);

  saveSessionDraft(dataDir, {
    ...draft,
    manifest: {
      ...draft.manifest,
      enabledTools: Array.from(enabledTools),
    },
  });

  return resolveToolContext(dataDir);
}

export function setSessionToolEnabled(dataDir: string, sessionId: string, toolId: ToolId, enabled: boolean) {
  const current = loadSessionContext(dataDir, sessionId);
  const next = new Set(current.enabledTools);
  if (enabled) next.add(toolId);
  else next.delete(toolId);
  saveSessionContext(dataDir, sessionId, {
    ...current,
    enabledTools: Array.from(next),
  });
  return resolveToolContext(dataDir, sessionId);
}
