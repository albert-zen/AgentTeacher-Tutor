import { loadToolConfig, loadSessionContextConfig, resolveToolEnabled, updateToolConfig, updateSessionToolOverride } from './toolConfig.js';
import {
  loadToolDefinitions,
  loadToolPromptFragment,
  type ToolId,
  type ToolRuntimeStatus,
  type ToolDefinition,
} from './toolDefinitions.js';
import { getToolRuntimeManager } from './toolRuntimeManager.js';
import type { ToolConfigFile, SessionContextConfig, ToolOverride } from './toolConfig.js';

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
  sessionOverride?: ToolOverride | null;
}

export interface ToolContext {
  enabledTools: ToolState[];
  visibleTools: ToolState[];
  promptFragments: Array<{ id: ToolId; label: string; content: string }>;
  globalConfig: ToolConfigFile;
  sessionConfig: SessionContextConfig;
}

function formatToolState(
  definition: ToolDefinition,
  config: ToolConfigFile['tools'][ToolId],
  enabled: boolean,
  status: ToolRuntimeStatus,
  message: string | undefined,
  sessionOverride?: ToolOverride | null,
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
    sessionOverride,
  };
}

export function resolveToolContext(dataDir: string, sessionId?: string): ToolContext {
  const definitions = loadToolDefinitions(dataDir);
  const globalConfig = loadToolConfig(dataDir);
  const sessionConfig = sessionId ? loadSessionContextConfig(dataDir, sessionId) : {};
  const runtimeManager = getToolRuntimeManager(process.cwd());

  const allStates: ToolState[] = [];
  for (const toolId of Object.keys(definitions) as ToolId[]) {
    const definition = definitions[toolId];
    const config = globalConfig.tools[toolId];
    const enabled = resolveToolEnabled(globalConfig, sessionConfig, toolId);
    const snapshot = runtimeManager.getSnapshot(toolId, enabled, config);
    allStates.push(
      formatToolState(
        definition,
        config,
        enabled,
        snapshot.status,
        snapshot.message,
        sessionConfig.toolOverrides?.[toolId] ?? null,
      ),
    );
  }

  const enabledTools = allStates.filter((tool) => tool.enabled && tool.exposeToModel);
  const visibleTools = allStates.filter((tool) => tool.uiVisible);
  const promptFragments = enabledTools.map((tool) => ({
    id: tool.id,
    label: tool.label,
    content: loadToolPromptFragment(dataDir, tool.id),
  }));

  return {
    enabledTools,
    visibleTools,
    promptFragments,
    globalConfig,
    sessionConfig,
  };
}

export async function refreshRuntimeState(dataDir: string, sessionId: string | undefined, toolId: ToolId) {
  const context = resolveToolContext(dataDir, sessionId);
  const tool = context.visibleTools.find((item) => item.id === toolId) ?? context.enabledTools.find((item) => item.id === toolId);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolId}`);
  }
  const runtimeManager = getToolRuntimeManager(process.cwd());
  const snapshot = await runtimeManager.check(toolId, tool.config);
  return {
    ...tool,
    status: snapshot.status,
    message: snapshot.message,
  };
}

export async function runToolRuntimeAction(
  dataDir: string,
  toolId: ToolId,
  action: 'start' | 'stop' | 'restart' | 'check',
) {
  const context = resolveToolContext(dataDir);
  const tool = context.visibleTools.find((item) => item.id === toolId);
  if (!tool) throw new Error(`Unknown tool: ${toolId}`);

  const runtimeManager = getToolRuntimeManager(process.cwd());
  const config = tool.config;
  const snapshot =
    action === 'start'
      ? await runtimeManager.start(toolId, config)
      : action === 'stop'
        ? await runtimeManager.stop(toolId, config)
        : action === 'restart'
          ? await runtimeManager.restart(toolId, config)
          : await runtimeManager.check(toolId, config);

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

export async function updateSessionToolState(
  dataDir: string,
  sessionId: string,
  toolId: ToolId,
  override: ToolOverride | null,
) {
  updateSessionToolOverride(dataDir, sessionId, toolId, override);
  return resolveToolContext(dataDir, sessionId);
}
