import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ModelMessage } from 'ai';
import type { Store } from '../db/index.js';
import type { ChatMessage } from '../types.js';
import { getSystemPrompt, resolveSystemPrompt } from './llm.js';
import { FileService } from './fileService.js';
import { parseReferences, type FileReference } from './referenceParser.js';
import { parseProfileBlocks, type ProfileBlock } from './profileParser.js';

// ─── Existing exports (assembleContext, used by context-preview endpoint) ────

export interface ContextConfig {
  profileBlockIds?: string[];
}

export interface AssembledContext {
  systemPrompt: string;
  profileBlocks: ProfileBlock[];
  selectedProfileContent: string;
}

export function assembleContext(dataDir: string, sessionId: string, config?: ContextConfig): AssembledContext {
  const systemPrompt = resolveSystemPrompt(dataDir, sessionId);

  let profileBlocks: ProfileBlock[] = [];
  const profilePath = join(dataDir, 'profile.md');
  if (existsSync(profilePath)) {
    const content = readFileSync(profilePath, 'utf-8');
    profileBlocks = parseProfileBlocks(content);
  }

  let selectedBlocks = profileBlocks;
  if (config?.profileBlockIds && config.profileBlockIds.length > 0) {
    selectedBlocks = profileBlocks.filter((b) => config.profileBlockIds!.includes(b.id));
  }

  const selectedProfileContent =
    selectedBlocks.length > 0 ? selectedBlocks.map((b) => `## ${b.name}\n${b.content}`).join('\n\n') : '';

  return { systemPrompt, profileBlocks, selectedProfileContent };
}

// ─── New: compileContext and the 5-stage pipeline ────────────────────────────

export interface CompileResult {
  system: string;
  messages: ModelMessage[];
  resolvedUserContent: string;
}

// Stage 1: Resolve system prompt and session prompt separately

export function resolvePromptsSeparately(
  dataDir: string,
  sessionId: string,
): { systemPrompt: string; sessionPrompt: string | null } {
  const customPath = join(dataDir, 'system-prompt.md');
  let systemPrompt = getSystemPrompt();
  try {
    if (existsSync(customPath)) {
      const content = readFileSync(customPath, 'utf-8').trim();
      if (content) systemPrompt = content;
    }
  } catch {
    /* fall through */
  }

  let sessionPrompt: string | null = null;
  const sessionPromptPath = join(dataDir, sessionId, 'session-prompt.md');
  try {
    if (existsSync(sessionPromptPath)) {
      const content = readFileSync(sessionPromptPath, 'utf-8').trim();
      if (content) sessionPrompt = content;
    }
  } catch {
    /* skip corrupted file */
  }

  return { systemPrompt, sessionPrompt };
}

// Stage 2: Read profile blocks and filter by session's context-config.json

export function selectProfileContent(dataDir: string, sessionId: string): string {
  const profilePath = join(dataDir, 'profile.md');
  if (!existsSync(profilePath)) return '';

  const content = readFileSync(profilePath, 'utf-8');
  let blocks = parseProfileBlocks(content);

  const configPath = join(dataDir, sessionId, 'context-config.json');
  if (existsSync(configPath)) {
    try {
      const config: ContextConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.profileBlockIds && config.profileBlockIds.length > 0) {
        blocks = blocks.filter((b) => config.profileBlockIds!.includes(b.id));
      }
    } catch {
      /* ignore corrupted config */
    }
  }

  return blocks.length > 0 ? blocks.map((b) => `## ${b.name}\n${b.content}`).join('\n\n') : '';
}

// Stage 3: Parse and resolve inline references in user message

export function formatSelection(
  path: string,
  content: string,
  options: { lines?: string; blockId?: string; startLine?: number },
): string {
  const lines = content.split('\n');
  const start = options.startLine ?? 1;
  const numbered = lines.map((line, i) => `${start + i}| ${line}`).join('\n');

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
        const block = blocks.find((b) => b.id === ref.blockId);
        if (block) {
          selections.push(formatSelection(ref.file, block.content, { blockId: ref.blockId }));
        }
      } else {
        const result = fileService.readFile({ path: ref.file });
        selections.push(formatSelection(ref.file, result.content, { startLine: 1 }));
      }
    } catch {
      /* file not found or read error — skip silently */
    }
  }

  if (selections.length > 0) {
    return `${message}\n\n${selections.join('\n\n')}`;
  }
  return message;
}

// Stage 4: Format system message with XML structure

export function formatSystemMessage(
  systemPrompt: string,
  sessionPrompt: string | null,
  profileContent: string,
): string {
  let result = `<system_prompt>\n${systemPrompt}\n</system_prompt>`;

  if (sessionPrompt) {
    result += `\n\n<session_prompt>\n${sessionPrompt}\n</session_prompt>`;
  }

  if (profileContent) {
    result += `\n\n<profile_blocks>\n${profileContent}\n</profile_blocks>`;
  }

  return result;
}

// Stage 5: Build ModelMessage[] from chat history + current user message

export function buildMessages(store: Store, sessionId: string, resolvedUserContent: string): ModelMessage[] {
  const history = store.getMessages(sessionId);
  const messages: ModelMessage[] = history.map((m: ChatMessage) => ({
    role: m.role as 'user' | 'assistant',
    content: m.role === 'user' ? (m.resolvedContent ?? m.content) : m.content,
  }));
  messages.push({ role: 'user', content: resolvedUserContent });
  return messages;
}

// ─── Main entry point ────────────────────────────────────────────────────────

export function compileContext(dataDir: string, store: Store, sessionId: string, userMessage: string): CompileResult {
  const { systemPrompt, sessionPrompt } = resolvePromptsSeparately(dataDir, sessionId);
  const profileContent = selectProfileContent(dataDir, sessionId);
  const sessionDir = join(dataDir, sessionId);
  const resolvedUserContent = resolveReferences(sessionDir, userMessage);
  const system = formatSystemMessage(systemPrompt, sessionPrompt, profileContent);
  const messages = buildMessages(store, sessionId, resolvedUserContent);
  return { system, messages, resolvedUserContent };
}
