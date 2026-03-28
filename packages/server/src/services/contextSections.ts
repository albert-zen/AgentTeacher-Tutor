import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ModelMessage } from 'ai';
import type { Store } from '../db/index.js';
import type { ChatMessage, MessagePart } from '../types.js';
import { getSystemPrompt } from './llm.js';
import { parseProfileBlocks, type ProfileBlock } from './profileParser.js';
import { FileService } from './fileService.js';
import { parseReferences, type FileReference } from './referenceParser.js';
import { loadSessionDraft, loadSessionContext, profileSelectionToLegacyBlockIds } from './sessionDraftService.js';
import { resolveToolContext } from './toolManager.js';

export interface ContextSection {
  id: string;
  kind: 'system_prompt' | 'session_prompt' | 'tool_instruction' | 'profile_block' | 'history_turn' | 'history_part';
  title: string;
  source: string;
  order: number;
  body: string;
  meta?: Record<string, unknown>;
}

export interface CompiledContextSections {
  sections: ContextSection[];
  system: string;
  messages: ModelMessage[];
  resolvedUserContent: string;
  enabledTools: ReturnType<typeof resolveToolContext>['enabledTools'][number]['id'][];
}

function readOptionalFile(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, 'utf-8').trim();
    return content || null;
  } catch {
    return null;
  }
}

function loadProfileBlocks(dataDir: string): ProfileBlock[] {
  const content = readOptionalFile(join(dataDir, 'profile.md'));
  return content ? parseProfileBlocks(content) : [];
}

function filterProfileBlocks(dataDir: string, profileBlockIds: string[] | undefined): ProfileBlock[] {
  const blocks = loadProfileBlocks(dataDir);
  if (profileBlockIds === undefined) return blocks;
  return blocks.filter((block) => profileBlockIds.includes(block.id));
}

function formatSelection(
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

function resolveReferences(sessionDir: string, message: string): string {
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
        continue;
      }

      const result = fileService.readFile({ path: ref.file });
      if (ref.blockId) {
        const blocks = parseProfileBlocks(result.content);
        const block = blocks.find((item) => item.id === ref.blockId);
        if (block) {
          selections.push(formatSelection(ref.file, block.content, { blockId: ref.blockId }));
        }
      } else {
        selections.push(formatSelection(ref.file, result.content, { startLine: 1 }));
      }
    } catch {
      /* ignore bad references */
    }
  }

  return selections.length > 0 ? `${message}\n\n${selections.join('\n\n')}` : message;
}

function buildHistoryPart(parentId: string, part: MessagePart, order: number) {
  if (part.type === 'text') {
    return {
      id: `${parentId}-part-${order}`,
      kind: 'text',
      title: `过程 ${order}: 文本`,
      body: part.content,
    };
  }

  if (part.type === 'tool-call') {
    return {
      id: `${parentId}-part-${order}`,
      kind: 'tool-call',
      title: `过程 ${order}: 工具调用`,
      body: JSON.stringify(part.args ?? {}, null, 2),
      toolName: part.toolName,
      args: part.args,
    };
  }

  return {
    id: `${parentId}-part-${order}`,
    kind: 'tool-result',
    title: `过程 ${order}: 工具结果`,
    body: JSON.stringify(part.result ?? {}, null, 2),
    toolName: part.toolName,
    result: part.result,
  };
}

function buildHistorySections(messages: ChatMessage[], baseOrder: number): ContextSection[] {
  return messages.map((message, index) => ({
    id: `history-${message.id}`,
    kind: 'history_turn',
    title: `${message.role === 'assistant' ? 'Teacher' : 'User'} #${index + 1}`,
    source: `data/${message.sessionId}/messages.json`,
    order: baseOrder + index,
    body: message.role === 'user' ? (message.resolvedContent ?? message.content) : message.content,
    meta: {
      role: message.role,
      createdAt: message.createdAt,
      parts: (message.parts ?? []).map((part, partIndex) => buildHistoryPart(`history-${message.id}`, part, partIndex + 1)),
    },
  }));
}

export class ContextSectionsService {
  buildDraftSections(dataDir: string): ContextSection[] {
    const draft = loadSessionDraft(dataDir);
    const toolContext = resolveToolContext(dataDir);
    const sections: ContextSection[] = [];

    const systemPrompt = readOptionalFile(join(dataDir, 'system-prompt.md')) ?? getSystemPrompt();
    sections.push({
      id: 'system-prompt',
      kind: 'system_prompt',
      title: '系统提示词',
      source: existsSync(join(dataDir, 'system-prompt.md')) ? 'data/system-prompt.md' : 'built-in default',
      order: 1,
      body: systemPrompt,
    });

    if (draft.sessionPrompt.trim()) {
      sections.push({
        id: 'session-prompt-draft',
        kind: 'session_prompt',
        title: 'Session Prompt Draft',
        source: 'data/session-draft/session-prompt.md',
        order: 2,
        body: draft.sessionPrompt,
        meta: { scope: 'draft' },
      });
    }

    let toolOrder = 3;
    for (const tool of toolContext.enabledTools) {
      const fragment = toolContext.promptFragments.find((item) => item.id === tool.id);
      if (!fragment) continue;
      sections.push({
        id: `tool-${tool.id}`,
        kind: 'tool_instruction',
        title: `${tool.label} 提示词`,
        source: `tool:${tool.id}`,
        order: toolOrder++,
        body: fragment.content,
        meta: { toolId: tool.id, label: tool.label },
      });
    }

    let profileOrder = 100;
    const profileBlocks = filterProfileBlocks(dataDir, profileSelectionToLegacyBlockIds(draft.manifest.profileSelection));
    for (const block of profileBlocks) {
      sections.push({
        id: `profile-${block.id}`,
        kind: 'profile_block',
        title: block.name,
        source: 'data/profile.md',
        order: profileOrder++,
        body: block.content,
        meta: { blockId: block.id },
      });
    }

    return sections.sort((a, b) => a.order - b.order);
  }

  buildSessionSections(dataDir: string, store: Store, sessionId: string): ContextSection[] {
    const context = loadSessionContext(dataDir, sessionId);
    const toolContext = resolveToolContext(dataDir, sessionId);
    const sections: ContextSection[] = [];

    const systemPrompt = readOptionalFile(join(dataDir, 'system-prompt.md')) ?? getSystemPrompt();
    sections.push({
      id: 'system-prompt',
      kind: 'system_prompt',
      title: '系统提示词',
      source: existsSync(join(dataDir, 'system-prompt.md')) ? 'data/system-prompt.md' : 'built-in default',
      order: 1,
      body: systemPrompt,
    });

    const sessionPrompt = readOptionalFile(join(dataDir, sessionId, 'session-prompt.md'));
    if (sessionPrompt) {
      sections.push({
        id: 'session-prompt',
        kind: 'session_prompt',
        title: 'Session Prompt',
        source: `data/${sessionId}/session-prompt.md`,
        order: 2,
        body: sessionPrompt,
        meta: { scope: 'session' },
      });
    }

    let toolOrder = 3;
    for (const tool of toolContext.enabledTools) {
      const fragment = toolContext.promptFragments.find((item) => item.id === tool.id);
      if (!fragment) continue;
      sections.push({
        id: `tool-${tool.id}`,
        kind: 'tool_instruction',
        title: `${tool.label} 提示词`,
        source: `tool:${tool.id}`,
        order: toolOrder++,
        body: fragment.content,
        meta: { toolId: tool.id, label: tool.label },
      });
    }

    let profileOrder = 100;
    const profileBlocks = filterProfileBlocks(dataDir, profileSelectionToLegacyBlockIds(context.profileSelection));
    for (const block of profileBlocks) {
      sections.push({
        id: `profile-${block.id}`,
        kind: 'profile_block',
        title: block.name,
        source: 'data/profile.md',
        order: profileOrder++,
        body: block.content,
        meta: { blockId: block.id },
      });
    }

    sections.push(...buildHistorySections(store.getMessages(sessionId), 1000));
    return sections.sort((a, b) => a.order - b.order);
  }

  serializeSectionsForModel(sections: ContextSection[]): string {
    const systemSection = sections.find((section) => section.kind === 'system_prompt');
    let result = systemSection ? `<system_prompt>\n${systemSection.body}\n</system_prompt>` : '';

    const sessionPrompt = sections.find((section) => section.kind === 'session_prompt');
    if (sessionPrompt) {
      result += `\n\n<session_prompt>\n${sessionPrompt.body}\n</session_prompt>`;
    }

    const toolSections = sections.filter((section) => section.kind === 'tool_instruction');
    if (toolSections.length > 0) {
      result += `\n\n<enabled_tools>\n${toolSections
        .map((section) => `${String(section.meta?.toolId)}: ${String(section.meta?.label ?? section.title)}`)
        .join('\n')}\n</enabled_tools>`;
      result += `\n\n<tool_instructions>\n${toolSections
        .map((section) => `<tool id="${String(section.meta?.toolId)}">\n${section.body}\n</tool>`)
        .join('\n\n')}\n</tool_instructions>`;
    }

    const profileSections = sections.filter((section) => section.kind === 'profile_block');
    if (profileSections.length > 0) {
      result += `\n\n<profile_blocks>\n${profileSections
        .map((section) => `## ${section.title}\n${section.body}`)
        .join('\n\n')}\n</profile_blocks>`;
    }

    return result.trim();
  }

  buildMessages(store: Store, sessionId: string, resolvedUserContent: string): ModelMessage[] {
    const history = store.getMessages(sessionId);
    const messages: ModelMessage[] = history.map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.role === 'user' ? (message.resolvedContent ?? message.content) : message.content,
    }));
    messages.push({ role: 'user', content: resolvedUserContent });
    return messages;
  }

  compileForSession(dataDir: string, store: Store, sessionId: string, userMessage: string): CompiledContextSections {
    const sections = this.buildSessionSections(dataDir, store, sessionId);
    const resolvedUserContent = resolveReferences(join(dataDir, sessionId), userMessage);
    const system = this.serializeSectionsForModel(sections);
    const messages = this.buildMessages(store, sessionId, resolvedUserContent);
    const toolIds = resolveToolContext(dataDir, sessionId).enabledTools.map((tool) => tool.id);
    return {
      sections,
      system,
      messages,
      resolvedUserContent,
      enabledTools: toolIds,
    };
  }
}

export const contextSectionsService = new ContextSectionsService();
