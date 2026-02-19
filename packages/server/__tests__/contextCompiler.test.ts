import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  assembleContext,
  resolvePromptsSeparately,
  selectProfileContent,
  resolveReferences,
  formatSelection,
  formatSystemMessage,
  buildMessages,
  compileContext,
} from '../src/services/contextCompiler.js';
import { Store } from '../src/db/index.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-ctx-'));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Existing assembleContext tests (preserved) ──────────────────────────────

describe('assembleContext', () => {
  it('includes system prompt from resolveSystemPrompt', () => {
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const ctx = assembleContext(tempDir, 'sess1');
    expect(ctx.systemPrompt).toContain('Teacher Agent');
  });

  it('includes all profile blocks by default', () => {
    writeFileSync(join(tempDir, 'profile.md'), '# Info\ndata\n# Goals\nlearn');
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const ctx = assembleContext(tempDir, 'sess1');
    expect(ctx.profileBlocks).toHaveLength(2);
    expect(ctx.selectedProfileContent).toContain('Info');
    expect(ctx.selectedProfileContent).toContain('Goals');
  });

  it('filters profile blocks when config specifies ids', () => {
    writeFileSync(join(tempDir, 'profile.md'), '# Info\ndata\n# Goals\nlearn');
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const ctx = assembleContext(tempDir, 'sess1', { profileBlockIds: ['Goals'] });
    expect(ctx.selectedProfileContent).not.toContain('Info');
    expect(ctx.selectedProfileContent).toContain('Goals');
  });

  it('returns empty profile when no profile.md', () => {
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const ctx = assembleContext(tempDir, 'sess1');
    expect(ctx.profileBlocks).toEqual([]);
    expect(ctx.selectedProfileContent).toBe('');
  });

  it('appends session prompt to system prompt', () => {
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    writeFileSync(join(tempDir, 'sess1', 'session-prompt.md'), '多用公式推导');
    const ctx = assembleContext(tempDir, 'sess1');
    expect(ctx.systemPrompt).toContain('多用公式推导');
  });

  it('is deterministic: same inputs produce same output', () => {
    writeFileSync(join(tempDir, 'profile.md'), '# A\ndata');
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const ctx1 = assembleContext(tempDir, 'sess1');
    const ctx2 = assembleContext(tempDir, 'sess1');
    expect(ctx1).toEqual(ctx2);
  });
});

// ─── Stage 1: resolvePromptsSeparately ───────────────────────────────────────

describe('resolvePromptsSeparately', () => {
  it('returns built-in default when no custom system-prompt.md', () => {
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const { systemPrompt, sessionPrompt } = resolvePromptsSeparately(tempDir, 'sess1');
    expect(systemPrompt).toContain('Teacher Agent');
    expect(sessionPrompt).toBeNull();
  });

  it('uses custom system-prompt.md when present', () => {
    writeFileSync(join(tempDir, 'system-prompt.md'), 'Custom system prompt');
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const { systemPrompt } = resolvePromptsSeparately(tempDir, 'sess1');
    expect(systemPrompt).toBe('Custom system prompt');
  });

  it('returns session prompt separately (not merged)', () => {
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    writeFileSync(join(tempDir, 'sess1', 'session-prompt.md'), '多用公式推导');
    const { systemPrompt, sessionPrompt } = resolvePromptsSeparately(tempDir, 'sess1');
    expect(systemPrompt).not.toContain('多用公式推导');
    expect(sessionPrompt).toBe('多用公式推导');
  });

  it('returns null sessionPrompt when file is empty', () => {
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    writeFileSync(join(tempDir, 'sess1', 'session-prompt.md'), '   ');
    const { sessionPrompt } = resolvePromptsSeparately(tempDir, 'sess1');
    expect(sessionPrompt).toBeNull();
  });
});

// ─── Stage 2: selectProfileContent ──────────────────────────────────────────

describe('selectProfileContent', () => {
  it('returns all blocks when no context-config.json', () => {
    writeFileSync(join(tempDir, 'profile.md'), '# Info\ndata\n# Goals\nlearn');
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const content = selectProfileContent(tempDir, 'sess1');
    expect(content).toContain('Info');
    expect(content).toContain('Goals');
  });

  it('filters blocks based on context-config.json', () => {
    writeFileSync(join(tempDir, 'profile.md'), '# Info\ndata\n# Goals\nlearn');
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    writeFileSync(join(tempDir, 'sess1', 'context-config.json'), JSON.stringify({ profileBlockIds: ['Goals'] }));
    const content = selectProfileContent(tempDir, 'sess1');
    expect(content).not.toContain('Info');
    expect(content).toContain('Goals');
  });

  it('returns empty string when no profile.md', () => {
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    expect(selectProfileContent(tempDir, 'sess1')).toBe('');
  });

  it('ignores corrupted context-config.json', () => {
    writeFileSync(join(tempDir, 'profile.md'), '# Info\ndata');
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    writeFileSync(join(tempDir, 'sess1', 'context-config.json'), 'not json');
    const content = selectProfileContent(tempDir, 'sess1');
    expect(content).toContain('Info');
  });
});

// ─── Stage 3: resolveReferences ─────────────────────────────────────────────

describe('resolveReferences', () => {
  it('resolves line references with correct line numbers', () => {
    const sessionDir = join(tempDir, 'sess1');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'notes.md'), 'line1\nline2\nline3\nline4\nline5\n');
    const result = resolveReferences(sessionDir, '看 [notes.md:2:4]');
    expect(result).toContain('<selection path="notes.md" lines="2-4">');
    expect(result).toContain('2| line2');
    expect(result).toContain('3| line3');
    expect(result).toContain('4| line4');
  });

  it('resolves block references by heading name', () => {
    const sessionDir = join(tempDir, 'sess1');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'guide.md'), '# 学习目标\n掌握基础\n理解原理\n# 练习\n做题');
    const result = resolveReferences(sessionDir, '看看 [guide.md#学习目标]');
    expect(result).toContain('<selection path="guide.md" blockid="学习目标">');
    expect(result).toContain('掌握基础');
    expect(result).toContain('理解原理');
    expect(result).not.toContain('做题');
  });

  it('resolves file-only references with full content', () => {
    const sessionDir = join(tempDir, 'sess1');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'short.md'), 'hello\nworld');
    const result = resolveReferences(sessionDir, '看 [short.md]');
    expect(result).toContain('<selection path="short.md">');
    expect(result).toContain('1| hello');
    expect(result).toContain('2| world');
  });

  it('deduplicates identical references', () => {
    const sessionDir = join(tempDir, 'sess1');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'f.md'), 'content');
    const result = resolveReferences(sessionDir, '[f.md] 和 [f.md]');
    const count = (result.match(/<selection/g) || []).length;
    expect(count).toBe(1);
  });

  it('skips gracefully when file not found', () => {
    const sessionDir = join(tempDir, 'sess1');
    mkdirSync(sessionDir, { recursive: true });
    const result = resolveReferences(sessionDir, '看 [missing.md:1:5]');
    expect(result).toBe('看 [missing.md:1:5]');
  });

  it('handles mixed line refs and block refs', () => {
    const sessionDir = join(tempDir, 'sess1');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'a.md'), 'L1\nL2\nL3');
    writeFileSync(join(sessionDir, 'b.md'), '# 目标\n内容');
    const result = resolveReferences(sessionDir, '[a.md:1:2] 和 [b.md#目标]');
    expect(result).toContain('<selection path="a.md" lines="1-2">');
    expect(result).toContain('<selection path="b.md" blockid="目标">');
  });

  it('returns original message when no refs found', () => {
    const sessionDir = join(tempDir, 'sess1');
    mkdirSync(sessionDir, { recursive: true });
    const msg = '没有引用的普通消息';
    expect(resolveReferences(sessionDir, msg)).toBe(msg);
  });

  it('skips block ref when block not found in file', () => {
    const sessionDir = join(tempDir, 'sess1');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'doc.md'), '# A\ncontent A');
    const result = resolveReferences(sessionDir, '[doc.md#不存在的块]');
    expect(result).not.toContain('<selection');
  });
});

// ─── formatSelection ────────────────────────────────────────────────────────

describe('formatSelection', () => {
  it('formats line reference with lines attribute', () => {
    const sel = formatSelection('file.md', 'hello\nworld', { lines: '5-6', startLine: 5 });
    expect(sel).toBe('<selection path="file.md" lines="5-6">\n5| hello\n6| world\n</selection>');
  });

  it('formats block reference with blockid attribute', () => {
    const sel = formatSelection('profile.md', 'block line 1\nblock line 2', { blockId: '学习目标' });
    expect(sel).toBe(
      '<selection path="profile.md" blockid="学习目标">\n1| block line 1\n2| block line 2\n</selection>',
    );
  });

  it('formats file-only reference starting at line 1', () => {
    const sel = formatSelection('doc.md', 'first\nsecond', { startLine: 1 });
    expect(sel).toBe('<selection path="doc.md">\n1| first\n2| second\n</selection>');
  });

  it('line numbers are prefixed correctly for multi-digit numbers', () => {
    const sel = formatSelection('f.md', 'a\nb', { lines: '99-100', startLine: 99 });
    expect(sel).toContain('99| a');
    expect(sel).toContain('100| b');
  });
});

// ─── Stage 4: formatSystemMessage ───────────────────────────────────────────

describe('formatSystemMessage', () => {
  it('includes all sections when all present', () => {
    const result = formatSystemMessage('sys', 'sess', 'profile data');
    expect(result).toContain('<system_prompt>\nsys\n</system_prompt>');
    expect(result).toContain('<session_prompt>\nsess\n</session_prompt>');
    expect(result).toContain('<profile_blocks>\nprofile data\n</profile_blocks>');
  });

  it('omits session_prompt when null', () => {
    const result = formatSystemMessage('sys', null, 'profile');
    expect(result).toContain('<system_prompt>');
    expect(result).not.toContain('<session_prompt>');
    expect(result).toContain('<profile_blocks>');
  });

  it('omits profile_blocks when empty string', () => {
    const result = formatSystemMessage('sys', 'sess', '');
    expect(result).toContain('<system_prompt>');
    expect(result).toContain('<session_prompt>');
    expect(result).not.toContain('<profile_blocks>');
  });

  it('returns only system_prompt when others missing', () => {
    const result = formatSystemMessage('sys only', null, '');
    expect(result).toBe('<system_prompt>\nsys only\n</system_prompt>');
  });
});

// ─── Stage 5: buildMessages ─────────────────────────────────────────────────

describe('buildMessages', () => {
  it('builds messages from plain text history', () => {
    const store = new Store(tempDir);
    store.createSession({ id: 's1', concept: 'test', createdAt: new Date().toISOString() });
    store.addMessage({
      id: 'm1',
      sessionId: 's1',
      role: 'user',
      content: 'hello',
      createdAt: new Date().toISOString(),
    });
    store.addMessage({
      id: 'm2',
      sessionId: 's1',
      role: 'assistant',
      content: 'hi',
      createdAt: new Date().toISOString(),
    });

    const msgs = buildMessages(store, 's1', 'new question');
    expect(msgs).toHaveLength(3);
    expect(msgs[0]).toEqual({ role: 'user', content: 'hello' });
    expect(msgs[1]).toEqual({ role: 'assistant', content: 'hi' });
    expect(msgs[2]).toEqual({ role: 'user', content: 'new question' });
  });

  it('uses resolvedContent for user messages when present', () => {
    const store = new Store(tempDir);
    store.createSession({ id: 's1', concept: 'test', createdAt: new Date().toISOString() });
    store.addMessage({
      id: 'm1',
      sessionId: 's1',
      role: 'user',
      content: '看 [f.md:1:3]',
      resolvedContent: '看 [f.md:1:3]\n\n<selection path="f.md" lines="1-3">\n1| a\n2| b\n3| c\n</selection>',
      createdAt: new Date().toISOString(),
    });

    const msgs = buildMessages(store, 's1', 'followup');
    expect(msgs[0].content).toContain('<selection');
    expect(msgs[1]).toEqual({ role: 'user', content: 'followup' });
  });

  it('falls back to content when resolvedContent is absent', () => {
    const store = new Store(tempDir);
    store.createSession({ id: 's1', concept: 'test', createdAt: new Date().toISOString() });
    store.addMessage({
      id: 'm1',
      sessionId: 's1',
      role: 'user',
      content: 'plain',
      createdAt: new Date().toISOString(),
    });

    const msgs = buildMessages(store, 's1', 'next');
    expect(msgs[0]).toEqual({ role: 'user', content: 'plain' });
  });

  it('uses content (not parts) for assistant messages', () => {
    const store = new Store(tempDir);
    store.createSession({ id: 's1', concept: 'test', createdAt: new Date().toISOString() });
    store.addMessage({
      id: 'm1',
      sessionId: 's1',
      role: 'assistant',
      content: 'reply text',
      parts: [
        { type: 'text', content: 'reply text' },
        { type: 'tool-call', toolName: 'read_file' },
      ],
      createdAt: new Date().toISOString(),
    });

    const msgs = buildMessages(store, 's1', 'q');
    expect(msgs[0]).toEqual({ role: 'assistant', content: 'reply text' });
  });

  it('appends current user message as last entry', () => {
    const store = new Store(tempDir);
    store.createSession({ id: 's1', concept: 'test', createdAt: new Date().toISOString() });
    const msgs = buildMessages(store, 's1', 'first message');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({ role: 'user', content: 'first message' });
  });
});

// ─── compileContext integration ─────────────────────────────────────────────

describe('compileContext integration', () => {
  it('full pipeline: system + session prompt + profile + refs + history', () => {
    const store = new Store(tempDir);
    const sessionId = 'int-sess';
    store.createSession({ id: sessionId, concept: 'integration', createdAt: new Date().toISOString() });

    writeFileSync(join(tempDir, 'system-prompt.md'), 'You are a tutor.');
    writeFileSync(join(tempDir, sessionId, 'session-prompt.md'), 'Focus on math.');
    writeFileSync(join(tempDir, 'profile.md'), '# Background\nCS student\n# Goals\nlearn calculus');
    writeFileSync(join(tempDir, sessionId, 'context-config.json'), JSON.stringify({ profileBlockIds: ['Goals'] }));
    writeFileSync(join(tempDir, sessionId, 'notes.md'), 'line1\nline2\nline3\n');

    store.addMessage({
      id: 'prev-u',
      sessionId,
      role: 'user',
      content: 'hello',
      createdAt: new Date().toISOString(),
    });
    store.addMessage({
      id: 'prev-a',
      sessionId,
      role: 'assistant',
      content: 'welcome',
      createdAt: new Date().toISOString(),
    });

    const result = compileContext(tempDir, store, sessionId, '看 [notes.md:1:2]');

    expect(result.system).toContain('<system_prompt>\nYou are a tutor.\n</system_prompt>');
    expect(result.system).toContain('<session_prompt>\nFocus on math.\n</session_prompt>');
    expect(result.system).toContain('<profile_blocks>');
    expect(result.system).toContain('Goals');
    expect(result.system).not.toContain('Background');

    expect(result.resolvedUserContent).toContain('<selection path="notes.md" lines="1-2">');
    expect(result.resolvedUserContent).toContain('1| line1');

    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toEqual({ role: 'user', content: 'hello' });
    expect(result.messages[1]).toEqual({ role: 'assistant', content: 'welcome' });
    expect(result.messages[2].content).toContain('<selection');
  });

  it('works with no optional files (minimal setup)', () => {
    const store = new Store(tempDir);
    const sessionId = 'min-sess';
    store.createSession({ id: sessionId, concept: 'minimal', createdAt: new Date().toISOString() });

    const result = compileContext(tempDir, store, sessionId, 'plain question');

    expect(result.system).toContain('<system_prompt>');
    expect(result.system).not.toContain('<session_prompt>');
    expect(result.system).not.toContain('<profile_blocks>');
    expect(result.resolvedUserContent).toBe('plain question');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({ role: 'user', content: 'plain question' });
  });
});
