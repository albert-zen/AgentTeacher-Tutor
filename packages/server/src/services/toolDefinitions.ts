export {
  type ToolId,
  type ToolRuntimeMode,
  type ToolRuntimeStatus,
  getToolRegistry as loadToolDefinitions,
} from './toolRegistry.js';

import { getToolRegistry } from './toolRegistry.js';
import type { ToolId } from './toolRegistry.js';

export type ToolDefinition = ReturnType<typeof getToolRegistry>[ToolId];

export function ensureToolDefinitionFiles() {
  // No-op: tool definitions are now fully owned by the server-side registry.
}

export function loadToolPromptFragment(_dataDir: string, toolId: ToolId): string {
  return getToolRegistry()[toolId].buildPromptFragment();
}
