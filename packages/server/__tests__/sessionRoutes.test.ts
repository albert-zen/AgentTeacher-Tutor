import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import request from 'supertest';
import { Store } from '../src/db/index.js';
import { createSessionRouter } from '../src/routes/session.js';

let tempDir: string;
let app: express.Express;
let store: Store;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-session-routes-'));
  store = new Store(tempDir);
  app = express();
  app.use(express.json());
  app.use('/api/session', createSessionRouter(store, tempDir));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Session lifecycle routes', () => {
  // E1
  it('POST /api/session creates a session with UUID, persists it, and returns the session object', async () => {
    const res = await request(app).post('/api/session').send({ concept: 'recursion' });

    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(UUID_RE);
    expect(res.body.concept).toBe('recursion');
    expect(res.body.createdAt).toBeDefined();

    const persisted = store.getSession(res.body.id);
    expect(persisted).toEqual(res.body);
  });

  // E2
  it('GET /api/session returns all sessions', async () => {
    await request(app).post('/api/session').send({ concept: 'stacks' });
    await request(app).post('/api/session').send({ concept: 'queues' });

    const res = await request(app).get('/api/session');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].concept).toBe('stacks');
    expect(res.body[1].concept).toBe('queues');
  });

  // E3
  it('GET /api/session/:id returns the session with only the most recent message page', async () => {
    const created = await request(app).post('/api/session').send({ concept: 'sorting' });
    const id = created.body.id;
    for (let i = 1; i <= 4; i += 1) {
      store.addMessage({
        id: `msg-${i}`,
        sessionId: id,
        role: i % 2 === 0 ? 'assistant' : 'user',
        content: `message ${i}`,
        createdAt: `2025-01-01T00:00:0${i}.000Z`,
      });
    }

    const res = await request(app).get(`/api/session/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.session).toEqual(created.body);
    expect(res.body.messages).toEqual([
      expect.objectContaining({ id: 'msg-1', content: 'message 1' }),
      expect.objectContaining({ id: 'msg-2', content: 'message 2' }),
      expect.objectContaining({ id: 'msg-3', content: 'message 3' }),
      expect.objectContaining({ id: 'msg-4', content: 'message 4' }),
    ]);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.hasMore).toBe(false);
  });

  it('GET /api/session/:id applies recent-page pagination when limit is provided', async () => {
    const created = await request(app).post('/api/session').send({ concept: 'sorting' });
    const id = created.body.id;
    for (let i = 1; i <= 5; i += 1) {
      store.addMessage({
        id: `msg-${i}`,
        sessionId: id,
        role: i % 2 === 0 ? 'assistant' : 'user',
        content: `message ${i}`,
        createdAt: `2025-01-01T00:00:0${i}.000Z`,
      });
    }

    const res = await request(app).get(`/api/session/${id}?limit=2`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([
      expect.objectContaining({ id: 'msg-4', content: 'message 4' }),
      expect.objectContaining({ id: 'msg-5', content: 'message 5' }),
    ]);
    expect(res.body.nextCursor).toBe('msg-4');
    expect(res.body.hasMore).toBe(true);
  });

  it('GET /api/session/:id/messages returns an older page before the given cursor', async () => {
    const created = await request(app).post('/api/session').send({ concept: 'sorting' });
    const id = created.body.id;
    for (let i = 1; i <= 5; i += 1) {
      store.addMessage({
        id: `msg-${i}`,
        sessionId: id,
        role: i % 2 === 0 ? 'assistant' : 'user',
        content: `message ${i}`,
        createdAt: `2025-01-01T00:00:0${i}.000Z`,
      });
    }

    const res = await request(app).get(`/api/session/${id}/messages?before=msg-4&limit=2`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        expect.objectContaining({ id: 'msg-2', content: 'message 2' }),
        expect.objectContaining({ id: 'msg-3', content: 'message 3' }),
      ],
      nextCursor: 'msg-2',
      hasMore: true,
    });
  });

  it('GET /api/session/:id/messages returns 400 when before cursor is invalid', async () => {
    const created = await request(app).post('/api/session').send({ concept: 'sorting' });

    const res = await request(app).get(`/api/session/${created.body.id}/messages?before=missing`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid message cursor');
  });

  // X1
  it('POST /api/session returns 400 when concept is missing or non-string', async () => {
    const noBody = await request(app).post('/api/session').send({});
    expect(noBody.status).toBe(400);

    const numericConcept = await request(app).post('/api/session').send({ concept: 42 });
    expect(numericConcept.status).toBe(400);

    const nullConcept = await request(app).post('/api/session').send({ concept: null });
    expect(nullConcept.status).toBe(400);
  });

  // X2
  it('GET /api/session/:id returns 404 for a non-existent id', async () => {
    const res = await request(app).get('/api/session/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('Session prompt draft copy on creation', () => {
  it('copies draft into new session when session-prompt-draft.md exists', async () => {
    writeFileSync(join(tempDir, 'session-prompt-draft.md'), '多用物理类比来解释');

    const res = await request(app).post('/api/session').send({ concept: 'test' });
    const sessionId = res.body.id;

    const promptPath = join(tempDir, sessionId, 'session-prompt.md');
    expect(existsSync(promptPath)).toBe(true);
    expect(readFileSync(promptPath, 'utf-8')).toBe('多用物理类比来解释');
  });

  it('does not create session-prompt.md when no draft exists', async () => {
    const res = await request(app).post('/api/session').send({ concept: 'test' });
    const sessionId = res.body.id;

    const promptPath = join(tempDir, sessionId, 'session-prompt.md');
    expect(existsSync(promptPath)).toBe(false);
  });

  it('does not create session-prompt.md when draft is empty/whitespace', async () => {
    writeFileSync(join(tempDir, 'session-prompt-draft.md'), '   \n  ');

    const res = await request(app).post('/api/session').send({ concept: 'test' });
    const sessionId = res.body.id;

    const promptPath = join(tempDir, sessionId, 'session-prompt.md');
    expect(existsSync(promptPath)).toBe(false);
  });

  it('each session gets its own copy — editing one does not affect others', async () => {
    writeFileSync(join(tempDir, 'session-prompt-draft.md'), '原始指令');

    const s1 = (await request(app).post('/api/session').send({ concept: 'a' })).body.id;
    const s2 = (await request(app).post('/api/session').send({ concept: 'b' })).body.id;

    // Modify session 1's prompt
    writeFileSync(join(tempDir, s1, 'session-prompt.md'), '修改后的指令');

    // Session 2 should still have original
    expect(readFileSync(join(tempDir, s2, 'session-prompt.md'), 'utf-8')).toBe('原始指令');
  });

  it('copies landing draft profile block selection into the new session context config', async () => {
    writeFileSync(join(tempDir, 'session-template-config.json'), JSON.stringify({ profileBlockIds: ['学习目标'] }));
    writeFileSync(join(tempDir, 'profile.md'), '# 基本信息\nA\n# 学习目标\nB');

    const res = await request(app).post('/api/session').send({ concept: 'test' });
    const sessionId = res.body.id;

    const contextConfigPath = join(tempDir, sessionId, 'context-config.json');
    expect(existsSync(contextConfigPath)).toBe(true);
    expect(JSON.parse(readFileSync(contextConfigPath, 'utf-8'))).toEqual({
      profileBlockIds: ['学习目标'],
    });
  });
});

describe('Session context memory route', () => {
  it('GET /api/session/:id/context-memory returns ordered modules with history parts', async () => {
    const createRes = await request(app).post('/api/session').send({ concept: 'OpenClaw' });
    const sessionId = createRes.body.id;
    mkdirSync(join(tempDir, sessionId), { recursive: true });

    writeFileSync(join(tempDir, 'system-prompt.md'), '系统提示词');
    writeFileSync(join(tempDir, sessionId, 'session-prompt.md'), 'Session 指令');
    writeFileSync(join(tempDir, 'profile.md'), '# 背景\n前端\n# 目标\n查资料');
    writeFileSync(join(tempDir, sessionId, 'context-config.json'), JSON.stringify({ profileBlockIds: ['目标'] }));

    store.addMessage({
      id: 'u1',
      sessionId,
      role: 'user',
      content: '最近很火的 openclaw 是什么',
      createdAt: '2026-03-28T10:00:00.000Z',
    });
    store.addMessage({
      id: 'a1',
      sessionId,
      role: 'assistant',
      content: '我先帮你搜一下。',
      parts: [
        { type: 'text', content: '我先帮你搜一下。' },
        { type: 'tool-call', toolName: 'web_search', args: { query: 'OpenClaw 是什么' } },
        { type: 'tool-result', toolName: 'web_search', result: { success: true } },
      ],
      createdAt: '2026-03-28T10:00:05.000Z',
    });

    const res = await request(app).get(`/api/session/${sessionId}/context-memory`);

    expect(res.status).toBe(200);
    expect(res.body.sections.map((section: { kind: string }) => section.kind)).toEqual([
      'system_prompt',
      'session_prompt',
      'tool_instructions',
      'profile_blocks',
      'history_turn',
      'history_turn',
    ]);
    expect(res.body.sections[5].meta.parts.map((part: { kind: string }) => part.kind)).toEqual([
      'text',
      'tool-call',
      'tool-result',
    ]);
  });
});
