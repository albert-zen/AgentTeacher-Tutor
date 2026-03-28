import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Store } from '../db/index.js';
import type { ChatMessage, MessagePart } from '../types.js';
import { parseProfileBlocks, type ProfileBlock } from './profileParser.js';
import { getSystemPrompt } from './llm.js';
import { loadSessionContextConfig } from './toolConfig.js';
import { resolvePromptsSeparately } from './contextCompiler.js';
import { resolveToolContext } from './toolManager.js';
import type { ToolId } from './toolDefinitions.js';

export type ContextPreviewSectionKind =
  | 'system_prompt'
  | 'session_prompt_draft'
  | 'session_prompt'
  | 'tool_instructions'
  | 'profile_blocks'
  | 'history_turn';

export interface ContextPreviewProcessPart {
  id: string;
  kind: MessagePart['type'];
  title: string;
  content?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

export interface ToolInstructionPreview {
  id: ToolId;
  label: string;
  content: string;
}

export interface HistoryTurnMeta {
  role: ChatMessage['role'];
  createdAt: string;
  parts?: ContextPreviewProcessPart[];
}

export interface ContextPreviewSection {
  id: string;
  kind: ContextPreviewSectionKind;
  title: string;
  summary: string;
  sourceLabel?: string;
  order: number;
  content?: string;
  meta?: {
    tools?: ToolInstructionPreview[];
    blocks?: ProfileBlock[];
    role?: ChatMessage['role'];
    createdAt?: string;
    parts?: ContextPreviewProcessPart[];
  };
}

export interface ContextPreviewResponse {
  sections: ContextPreviewSection[];
}

function summarize(text: string, maxLength = 120): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '暂无内容';
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
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

function selectProfileBlocks(dataDir: string, sessionId?: string): ProfileBlock[] {
  const profileBlocks = loadProfileBlocks(dataDir);
  if (!sessionId) return profileBlocks;

  const config = loadSessionContextConfig(dataDir, sessionId);
  if (!config.profileBlockIds || config.profileBlockIds.length === 0) {
    return profileBlocks;
  }
  return profileBlocks.filter((block) => config.profileBlockIds?.includes(block.id));
}

function createToolSection(
  dataDir: string,
  sessionId: string | undefined,
  order: number,
): ContextPreviewSection | null {
  const toolContext = resolveToolContext(dataDir, sessionId);
  if (toolContext.promptFragments.length === 0) return null;

  const tools = toolContext.promptFragments.map((fragment) => ({
    id: fragment.id,
    label: fragment.label,
    content: fragment.content,
  }));
  const content = tools
    .map((tool) => `## ${tool.label} (${tool.id})\n${tool.content}`)
    .join('\n\n');

  return {
    id: 'tool-instructions',
    kind: 'tool_instructions',
    title: '工具提示词',
    summary: `${tools.length} 个启用工具会向模型注入额外说明`,
    sourceLabel: 'data/tools/*.md',
    order,
    content,
    meta: { tools },
  };
}

function createProfileSection(
  dataDir: string,
  sessionId: string | undefined,
  order: number,
): ContextPreviewSection | null {
  const blocks = selectProfileBlocks(dataDir, sessionId);
  if (blocks.length === 0) return null;

  const content = blocks.map((block) => `## ${block.name}\n${block.content}`.trim()).join('\n\n');
  return {
    id: 'profile-blocks',
    kind: 'profile_blocks',
    title: '用户 Profile',
    summary: `${blocks.length} 个档案块会进入模型上下文`,
    sourceLabel: 'data/profile.md',
    order,
    content,
    meta: { blocks },
  };
}

function messageTitle(message: ChatMessage, index: number): string {
  return `${message.role === 'user' ? 'User' : 'Teacher'} #${index + 1}`;
}

function buildHistoryParts(parts: MessagePart[] | undefined): ContextPreviewProcessPart[] | undefined {
  if (!parts || parts.length === 0) return undefined;
  return parts.map((part, index) => {
    if (part.type === 'text') {
      return {
        id: `part-${index}`,
        kind: 'text',
        title: `过程 ${index + 1}: 文本`,
        content: part.content,
      };
    }
    if (part.type === 'tool-call') {
      return {
        id: `part-${index}`,
        kind: 'tool-call',
        title: `过程 ${index + 1}: 工具调用`,
        toolName: part.toolName,
        args: part.args,
        content: JSON.stringify(part.args ?? {}, null, 2),
      };
    }
    return {
      id: `part-${index}`,
      kind: 'tool-result',
      title: `过程 ${index + 1}: 工具结果`,
      toolName: part.toolName,
      result: part.result,
      content: JSON.stringify(part.result ?? {}, null, 2),
    };
  });
}

function createHistorySections(messages: ChatMessage[], startOrder: number): ContextPreviewSection[] {
  return messages.map((message, index) => {
    const parts = buildHistoryParts(message.parts);
    return {
      id: `history-${message.id}`,
      kind: 'history_turn',
      title: messageTitle(message, index),
      summary: summarize(message.content || message.resolvedContent || ''),
      sourceLabel: 'data/{sessionId}/messages.json',
      order: startOrder + index,
      content: message.role === 'user' ? (message.resolvedContent ?? message.content) : message.content,
      meta: {
        role: message.role,
        createdAt: message.createdAt,
        parts,
      },
    };
  });
}

export function buildTemplateContextPreview(dataDir: string): ContextPreviewResponse {
  const sections: ContextPreviewSection[] = [];
  const systemPrompt = readOptionalFile(join(dataDir, 'system-prompt.md')) ?? getSystemPrompt();
  sections.push({
    id: 'system-prompt',
    kind: 'system_prompt',
    title: '系统提示词',
    summary: summarize(systemPrompt),
    sourceLabel: existsSync(join(dataDir, 'system-prompt.md')) ? 'data/system-prompt.md' : 'built-in default',
    order: 1,
    content: systemPrompt,
  });

  const sessionPromptDraft = readOptionalFile(join(dataDir, 'session-prompt-draft.md'));
  if (sessionPromptDraft) {
    sections.push({
      id: 'session-prompt-draft',
      kind: 'session_prompt_draft',
      title: 'Session Prompt Draft',
      summary: summarize(sessionPromptDraft),
      sourceLabel: 'data/session-prompt-draft.md',
      order: 2,
      content: sessionPromptDraft,
    });
  }

  const toolSection = createToolSection(dataDir, undefined, 3);
  if (toolSection) sections.push(toolSection);

  const profileSection = createProfileSection(dataDir, undefined, 4);
  if (profileSection) sections.push(profileSection);

  return {
    sections: sections.sort((a, b) => a.order - b.order),
  };
}

export function buildSessionContextMemory(dataDir: string, store: Store, sessionId: string): ContextPreviewResponse {
  const sections: ContextPreviewSection[] = [];
  const { systemPrompt, sessionPrompt } = resolvePromptsSeparately(dataDir, sessionId);
  sections.push({
    id: 'system-prompt',
    kind: 'system_prompt',
    title: '系统提示词',
    summary: summarize(systemPrompt),
    sourceLabel: existsSync(join(dataDir, 'system-prompt.md')) ? 'data/system-prompt.md' : 'built-in default',
    order: 1,
    content: systemPrompt,
  });

  if (sessionPrompt) {
    sections.push({
      id: 'session-prompt',
      kind: 'session_prompt',
      title: 'Session Prompt',
      summary: summarize(sessionPrompt),
      sourceLabel: `data/${sessionId}/session-prompt.md`,
      order: 2,
      content: sessionPrompt,
    });
  }

  const toolSection = createToolSection(dataDir, sessionId, 3);
  if (toolSection) sections.push(toolSection);

  const profileSection = createProfileSection(dataDir, sessionId, 4);
  if (profileSection) sections.push(profileSection);

  const messages = store.getMessages(sessionId);
  sections.push(...createHistorySections(messages, 5));

  return {
    sections: sections.sort((a, b) => a.order - b.order),
  };
}
