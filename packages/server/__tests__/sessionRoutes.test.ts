import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import request from 'supertest';
import { Store } from '../src/db/index.js';
import { createSessionRouter } from '../src/routes/session.js';
import type { LLMConfig } from '../src/services/llm.js';

let tempDir: string;
let app: express.Express;
let store: Store;

const llmConfig: LLMConfig = {
  provider: 'openai',
  apiKey: '',
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-4o',
};

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-session-routes-'));
  store = new Store(tempDir);
  app = express();
  app.use(express.json());
  app.use('/api/session', createSessionRouter(store, tempDir, llmConfig));
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
