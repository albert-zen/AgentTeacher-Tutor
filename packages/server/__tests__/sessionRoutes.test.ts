import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
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
  it('GET /api/session/:id returns { session, messages } for a valid id', async () => {
    const created = await request(app).post('/api/session').send({ concept: 'sorting' });
    const id = created.body.id;

    const res = await request(app).get(`/api/session/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.session).toEqual(created.body);
    expect(res.body.messages).toEqual([]);
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
});
