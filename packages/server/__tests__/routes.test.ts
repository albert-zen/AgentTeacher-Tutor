import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import request from 'supertest';
import { Store } from '../src/db/index.js';
import { createFilesRouter } from '../src/routes/files.js';
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
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-routes-'));
  store = new Store(tempDir);
  app = express();
  app.use(express.json());
  app.use('/api/session', createSessionRouter(store, tempDir, llmConfig));
  app.use('/api', createFilesRouter(store, tempDir, llmConfig));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('GET /api/system-prompt', () => {
  it('returns empty content with defaultContent when file does not exist', async () => {
    const res = await request(app).get('/api/system-prompt');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('');
    expect(res.body.totalLines).toBe(0);
    expect(typeof res.body.defaultContent).toBe('string');
    expect(res.body.defaultContent.length).toBeGreaterThan(0);
  });

  it('returns file content with defaultContent when system-prompt.md exists', async () => {
    writeFileSync(join(tempDir, 'system-prompt.md'), '# Custom Prompt\n\nBe helpful.');
    const res = await request(app).get('/api/system-prompt');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('# Custom Prompt\n\nBe helpful.');
    expect(res.body.totalLines).toBe(3);
    expect(typeof res.body.defaultContent).toBe('string');
  });
});

describe('PUT /api/system-prompt', () => {
  it('creates system-prompt.md and returns success', async () => {
    const res = await request(app).put('/api/system-prompt').send({ content: 'New prompt content' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // Verify it was saved
    const get = await request(app).get('/api/system-prompt');
    expect(get.body.content).toBe('New prompt content');
  });
});

describe('GET /api/llm-status', () => {
  it('returns unconfigured status when apiKey is empty', async () => {
    const res = await request(app).get('/api/llm-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      configured: false,
      provider: 'openai',
      model: 'gpt-4o',
      baseURL: 'https://api.openai.com/v1',
    });
  });

  it('returns configured status when apiKey is set', async () => {
    const configuredLlm: LLMConfig = {
      provider: 'dashscope',
      apiKey: 'sk-test-key',
      baseURL: 'https://dashscope.aliyuncs.com/v1',
      model: 'qwen-max',
    };
    const app2 = express();
    app2.use(express.json());
    app2.use('/api', createFilesRouter(store, tempDir, configuredLlm));

    const res = await request(app2).get('/api/llm-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      configured: true,
      provider: 'dashscope',
      model: 'qwen-max',
      baseURL: 'https://dashscope.aliyuncs.com/v1',
    });
  });
});

describe('GET /api/session/:id/milestones', () => {
  it('returns zeros when session has no milestones.md', async () => {
    // Create a session first
    const createRes = await request(app).post('/api/session').send({ concept: 'test concept' });
    const sessionId = createRes.body.id;

    const res = await request(app).get(`/api/session/${sessionId}/milestones`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 0, completed: 0 });
  });

  it('returns milestone counts when milestones.md exists', async () => {
    const createRes = await request(app).post('/api/session').send({ concept: 'quantum mechanics' });
    const sessionId = createRes.body.id;

    // Write milestones.md in session directory
    const sessionDir = join(tempDir, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      join(sessionDir, 'milestones.md'),
      '# 里程碑: 量子力学\n\n- [x] 波粒二象性\n- [ ] 薛定谔方程\n- [x] 测量问题\n- [ ] 量子纠缠\n',
    );

    const res = await request(app).get(`/api/session/${sessionId}/milestones`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 4, completed: 2 });
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/session/nonexistent/milestones');
    expect(res.status).toBe(404);
  });
});
