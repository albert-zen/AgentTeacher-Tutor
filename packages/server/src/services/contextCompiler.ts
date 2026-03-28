import type { Store } from '../db/index.js';
import { contextSectionsService } from './contextSections.js';
import { loadSessionContext, profileSelectionToLegacyBlockIds } from './sessionDraftService.js';
import { parseProfileBlocks, type ProfileBlock } from './profileParser.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveToolContext } from './toolManager.js';
import type { ToolId } from './toolDefinitions.js';
import { FileService } from './fileService.js';
import { parseReferences, type FileReference } from './referenceParser.js';
import { resolveSystemPrompt } from './llm.js';

export interface ContextConfig {
  profileBlockIds?: string[];
}

export interface AssembledContext {
  systemPrompt: string;
  profileBlocks: ProfileBlock[];
  selectedProfileContent: string;
  enabledTools?: { id: ToolId; label: string }[];
  toolInstructions?: string;
}

export interface CompileResult {
  system: string;
  messages: import('ai').ModelMessage[];
  resolvedUserContent: string;
  enabledTools: ToolId[];
}

export function formatSelection(
  path: string,
  content: string,
  options: { lines?: string; blockId?: string; startLine?: number },
): string {
  const lines = content.split('\n');
  const start = options.startLine ?? 1;
  const numbered = lines.map((line, index) => `${start + index}| ${line}`).join('\n');

  let attrs = `path="${path}"`;
  if (options.lines) attrs += ` lines="${options.lines}"`;
  if (options.blockId) attrs += ` blockid="${options.blockId}"`;

  return `<selection ${attrs}>\n${numbered}\n</selection>`;
}

export function resolveReferences(sessionDir: string, message: string): string {
  const refs = parseReferences(message);
  if (refs.length === 0) return message;

  const seen = new Set<string>();
  const uniqueRefs: FileReference[] = [];
  for (const ref of refs) {
    const key = ref.blockId
      ? `${ref.file}#${ref.blockId}`
      : ref.startLine !== undefined && ref.endLine !== undefined
        ? `${ref.file}:${ref.startLine}:${ref.endLine}`
        : ref.file;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRefs.push(ref);
    }
  }

  const fileService = new FileService(sessionDir);
  const selections: string[] = [];

  for (const ref of uniqueRefs) {
    try {
      if (ref.startLine !== undefined && ref.endLine !== undefined) {
        const result = fileService.readFile({ path: ref.file, startLine: ref.startLine, endLine: ref.endLine });
        selections.push(
          formatSelection(ref.file, result.content, {
            lines: `${ref.startLine}-${ref.endLine}`,
            startLine: ref.startLine,
          }),
        );
      } else if (ref.blockId) {
        const result = fileService.readFile({ path: ref.file });
        const blocks = parseProfileBlocks(result.content);
        const block = blocks.find((item) => item.id === ref.blockId);
        if (block) {
          selections.push(formatSelection(ref.file, block.content, { blockId: ref.blockId }));
        }
      } else {
        const result = fileService.readFile({ path: ref.file });
        selections.push(formatSelection(ref.file, result.content, { startLine: 1 }));
      }
    } catch {
      /* ignore bad refs */
    }
  }

  return selections.length > 0 ? `${message}\n\n${selections.join('\n\n')}` : message;
}

function loadAllProfileBlocks(dataDir: string): ProfileBlock[] {
  const path = join(dataDir, 'profile.md');
  if (!existsSync(path)) return [];
  return parseProfileBlocks(readFileSync(path, 'utf-8'));
}

export function assembleContext(dataDir: string, sessionId: string, config?: ContextConfig): AssembledContext {
  const toolContext = resolveToolContext(dataDir, sessionId);
  const profileBlocks = loadAllProfileBlocks(dataDir);
  const profileSelection =
    config?.profileBlockIds !== undefined
      ? config.profileBlockIds
      : profileSelectionToLegacyBlockIds(loadSessionContext(dataDir, sessionId).profileSelection);
  const selectedProfileBlocks =
    profileSelection === undefined
      ? profileBlocks
      : profileBlocks.filter((block) => profileSelection.includes(block.id));

  return {
    systemPrompt: resolveSystemPrompt(dataDir, sessionId),
    profileBlocks,
    selectedProfileContent: selectedProfileBlocks.map((block) => `## ${block.name}\n${block.content}`).join('\n\n'),
    enabledTools: toolContext.enabledTools.map((tool) => ({ id: tool.id, label: tool.label })),
    toolInstructions: toolContext.promptFragments.map((fragment) => fragment.content).join('\n\n'),
  };
}

export function resolvePromptsSeparately(
  dataDir: string,
  sessionId: string,
): { systemPrompt: string; sessionPrompt: string | null } {
  const sections = contextSectionsService.buildSessionSections(
    dataDir,
    { getMessages: () => [] } as unknown as Store,
    sessionId,
  );
  return {
    systemPrompt: sections.find((section) => section.kind === 'system_prompt')?.body ?? '',
    sessionPrompt: sections.find((section) => section.kind === 'session_prompt')?.body ?? null,
  };
}

export function selectProfileContent(dataDir: string, sessionId: string): string {
  const selection = profileSelectionToLegacyBlockIds(loadSessionContext(dataDir, sessionId).profileSelection);
  const blocks = loadAllProfileBlocks(dataDir);
  const selected = selection === undefined ? blocks : blocks.filter((block) => selection.includes(block.id));
  return selected.map((block) => `## ${block.name}\n${block.content}`).join('\n\n');
}

export function formatSystemMessage(
  systemPrompt: string,
  sessionPrompt: string | null,
  profileContent: string,
  toolContext: ReturnType<typeof resolveToolContext>,
): string {
  let result = `<system_prompt>\n${systemPrompt}\n</system_prompt>`;
  if (sessionPrompt) {
    result += `\n\n<session_prompt>\n${sessionPrompt}\n</session_prompt>`;
  }
  if (profileContent) {
    result += `\n\n<profile_blocks>\n${profileContent}\n</profile_blocks>`;
  }
  if (toolContext.enabledTools.length > 0) {
    result += `\n\n<enabled_tools>\n${toolContext.enabledTools.map((tool) => `${tool.id}: ${tool.label}`).join('\n')}\n</enabled_tools>`;
  }
  if (toolContext.promptFragments.length > 0) {
    result += `\n\n<tool_instructions>\n${toolContext.promptFragments
      .map((fragment) => `<tool id="${fragment.id}">\n${fragment.content}\n</tool>`)
      .join('\n\n')}\n</tool_instructions>`;
  }
  return result;
}

export function buildMessages(store: Store, sessionId: string, resolvedUserContent: string) {
  return contextSectionsService.buildMessages(store, sessionId, resolvedUserContent);
}

export function compileContext(dataDir: string, store: Store, sessionId: string, userMessage: string): CompileResult {
  const compiled = contextSectionsService.compileForSession(dataDir, store, sessionId, userMessage);
  return {
    system: compiled.system,
    messages: compiled.messages,
    resolvedUserContent: compiled.resolvedUserContent,
    enabledTools: compiled.enabledTools,
  };
}
