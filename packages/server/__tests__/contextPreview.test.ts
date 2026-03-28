import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Store } from '../src/db/index.js';
import { buildSessionContextMemory, buildTemplateContextPreview } from '../src/services/contextPreview.js';
import { saveToolConfig } from '../src/services/toolConfig.js';
import { saveSessionContext, saveSessionDraft } from '../src/services/sessionDraftService.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-context-preview-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('buildTemplateContextPreview', () => {
  it('returns ordered template sections for system prompt, draft, tools, and profile', () => {
    writeFileSync(join(tempDir, 'system-prompt.md'), '你是一个温和的老师。');
    writeFileSync(join(tempDir, 'profile.md'), '# 背景\n前端工程师');
    saveSessionDraft(tempDir, {
      manifest: {
        version: 1,
        profileSelection: { mode: 'inherit_all' },
        enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
      },
      sessionPrompt: '先解释直觉，再给形式化定义。',
    });
    saveToolConfig(tempDir, {
      tools: {
        web_search: {},
      },
    });

    const result = buildTemplateContextPreview(tempDir);

    expect(result.sections.map((section) => section.kind)).toEqual([
      'system_prompt',
      'session_prompt_draft',
      'tool_instructions',
      'profile_blocks',
    ]);
    expect(result.sections[2]?.meta?.tools?.map((tool) => tool.id)).toContain('web_search');
    expect(result.sections[3]?.meta?.blocks?.map((block) => block.id)).toEqual(['背景']);
  });

  it('filters template profile blocks using the new-session draft config', () => {
    writeFileSync(join(tempDir, 'profile.md'), '# 背景\n前端工程师\n# 目标\n理解上下文');
    saveSessionDraft(tempDir, {
      manifest: {
        version: 1,
        profileSelection: { mode: 'explicit', blockIds: ['目标'] },
        enabledTools: ['read_file', 'write_file', 'fetch_url'],
      },
      sessionPrompt: '',
    });

    const result = buildTemplateContextPreview(tempDir);

    expect(result.sections.find((section) => section.kind === 'profile_blocks')?.meta?.blocks?.map((block) => block.id)).toEqual([
      '目标',
    ]);
  });

  it('omits template profile section when the draft config selects no profile blocks', () => {
    writeFileSync(join(tempDir, 'profile.md'), '# 背景\n前端工程师');
    saveSessionDraft(tempDir, {
      manifest: {
        version: 1,
        profileSelection: { mode: 'explicit', blockIds: [] },
        enabledTools: ['read_file', 'write_file', 'fetch_url'],
      },
      sessionPrompt: '',
    });

    const result = buildTemplateContextPreview(tempDir);

    expect(result.sections.some((section) => section.kind === 'profile_blocks')).toBe(false);
  });
});

describe('buildSessionContextMemory', () => {
  it('returns ordered session sections including filtered profile blocks and full history', () => {
    const store = new Store(tempDir);
    const sessionId = 'session-1';
    store.createSession({ id: sessionId, concept: 'OpenClaw', createdAt: '2026-03-28T10:00:00.000Z' });
    mkdirSync(join(tempDir, sessionId), { recursive: true });

    writeFileSync(join(tempDir, 'system-prompt.md'), '系统提示词');
    writeFileSync(join(tempDir, sessionId, 'session-prompt.md'), 'Session 定制指令');
    writeFileSync(join(tempDir, 'profile.md'), '# 背景\n前端\n# 目标\n理解上下文编排');
    saveSessionDraft(tempDir, {
      manifest: {
        version: 1,
        profileSelection: { mode: 'inherit_all' },
        enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
      },
      sessionPrompt: '',
    });
    saveSessionContext(tempDir, sessionId, {
      version: 1,
      profileSelection: { mode: 'explicit', blockIds: ['目标'] },
      enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
    });
    saveToolConfig(tempDir, {
      tools: {
        web_search: {},
      },
    });

    store.addMessage({
      id: 'u1',
      sessionId,
      role: 'user',
      content: '最近很火的 openclaw 是什么',
      createdAt: '2026-03-28T10:01:00.000Z',
    });
    store.addMessage({
      id: 'a1',
      sessionId,
      role: 'assistant',
      content: '我先帮你搜一下。',
      parts: [
        { type: 'text', content: '我先帮你搜一下。' },
        { type: 'tool-call', toolName: 'web_search', args: { query: 'OpenClaw 是什么' } },
        {
          type: 'tool-result',
          toolName: 'web_search',
          result: { success: true, data: { results: [{ title: 'OpenClaw docs' }] } },
        },
      ],
      createdAt: '2026-03-28T10:01:10.000Z',
    });

    const result = buildSessionContextMemory(tempDir, store, sessionId);

    expect(result.sections.map((section) => section.kind)).toEqual([
      'system_prompt',
      'session_prompt',
      'tool_instructions',
      'profile_blocks',
      'history_turn',
      'history_turn',
    ]);
    expect(result.sections[3]?.meta?.blocks?.map((block) => block.id)).toEqual(['目标']);

    const assistantTurn = result.sections[5];
    expect(assistantTurn?.meta?.role).toBe('assistant');
    expect(assistantTurn?.meta?.parts?.map((part) => part.kind)).toEqual(['text', 'tool-call', 'tool-result']);
  });

  it('omits optional modules cleanly when session prompt, profile, and history are absent', () => {
    const store = new Store(tempDir);
    const sessionId = 'session-2';
    store.createSession({ id: sessionId, concept: 'test', createdAt: '2026-03-28T10:00:00.000Z' });
    mkdirSync(join(tempDir, sessionId), { recursive: true });

    const result = buildSessionContextMemory(tempDir, store, sessionId);

    expect(result.sections.map((section) => section.kind)).toEqual(['system_prompt', 'tool_instructions']);
  });
});
