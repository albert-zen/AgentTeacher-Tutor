import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import request from 'supertest';
import { Store } from '../src/db/index.js';
import { createFilesRouter } from '../src/routes/files.js';
import { createSessionRouter } from '../src/routes/session.js';
import { getSystemPrompt, resolveSystemPrompt, loadLLMConfig, saveLLMConfig } from '../src/services/llm.js';

let tempDir: string;
let app: express.Express;
let store: Store;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-routes-'));
  store = new Store(tempDir);
  app = express();
  app.use(express.json());
  app.use('/api/session', createSessionRouter(store, tempDir));
  app.use('/api', createFilesRouter(store, tempDir));
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
  it('returns unconfigured status when no config file and no env vars', async () => {
    const res = await request(app).get('/api/llm-status');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body).not.toHaveProperty('apiKey');
  });

  it('returns configured status after saving config file', async () => {
    saveLLMConfig(tempDir, {
      provider: 'dashscope',
      apiKey: 'sk-test-key',
      baseURL: 'https://dashscope.aliyuncs.com/v1',
      model: 'qwen-max',
    });

    const res = await request(app).get('/api/llm-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      configured: true,
      provider: 'dashscope',
      model: 'qwen-max',
      baseURL: 'https://dashscope.aliyuncs.com/v1',
    });
  });
});

describe('PUT /api/llm-config', () => {
  it('saves config and returns status without apiKey', async () => {
    const res = await request(app).put('/api/llm-config').send({
      provider: 'dashscope',
      apiKey: 'sk-new-key',
      baseURL: 'https://dashscope.aliyuncs.com/v1',
      model: 'qwen-max',
    });
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.provider).toBe('dashscope');
    expect(res.body.model).toBe('qwen-max');
    expect(res.body).not.toHaveProperty('apiKey');
  });

  it('supports partial updates (merge with existing)', async () => {
    saveLLMConfig(tempDir, {
      provider: 'openai',
      apiKey: 'sk-old',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    });

    const res = await request(app).put('/api/llm-config').send({ model: 'gpt-4o-mini' });
    expect(res.status).toBe(200);
    expect(res.body.model).toBe('gpt-4o-mini');
    expect(res.body.provider).toBe('openai');

    const saved = loadLLMConfig(tempDir);
    expect(saved.apiKey).toBe('sk-old');
    expect(saved.model).toBe('gpt-4o-mini');
  });

  it('reflects in subsequent llm-status calls', async () => {
    await request(app).put('/api/llm-config').send({
      apiKey: 'sk-runtime',
      model: 'claude-3',
    });

    const res = await request(app).get('/api/llm-status');
    expect(res.body.configured).toBe(true);
    expect(res.body.model).toBe('claude-3');
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

describe('loadLLMConfig / saveLLMConfig', () => {
  it('falls back to defaults when no config file exists', () => {
    const config = loadLLMConfig(tempDir);
    expect(config.provider).toBe('openai');
    expect(config.apiKey).toBe('');
    expect(config.baseURL).toBe('https://api.openai.com/v1');
    expect(config.model).toBe('gpt-4o');
  });

  it('reads from llm-config.json when it exists', () => {
    writeFileSync(
      join(tempDir, 'llm-config.json'),
      JSON.stringify({ provider: 'custom', apiKey: 'key-123', baseURL: 'https://custom.api', model: 'my-model' }),
    );
    const config = loadLLMConfig(tempDir);
    expect(config.provider).toBe('custom');
    expect(config.apiKey).toBe('key-123');
    expect(config.baseURL).toBe('https://custom.api');
    expect(config.model).toBe('my-model');
  });

  it('handles corrupted config file gracefully', () => {
    writeFileSync(join(tempDir, 'llm-config.json'), 'not valid json{{{');
    const config = loadLLMConfig(tempDir);
    expect(config.provider).toBe('openai');
  });

  it('saveLLMConfig merges with existing config', () => {
    saveLLMConfig(tempDir, {
      provider: 'openai',
      apiKey: 'sk-1',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    });
    saveLLMConfig(tempDir, { model: 'gpt-4o-mini' });
    const config = loadLLMConfig(tempDir);
    expect(config.apiKey).toBe('sk-1');
    expect(config.model).toBe('gpt-4o-mini');
  });
});

describe('resolveSystemPrompt', () => {
  it('returns built-in default when no custom file exists', () => {
    const prompt = resolveSystemPrompt(tempDir);
    expect(prompt).toBe(getSystemPrompt());
    expect(prompt).toContain('Teacher Agent');
  });

  it('returns custom prompt when system-prompt.md exists', () => {
    writeFileSync(join(tempDir, 'system-prompt.md'), 'You are a math tutor.');
    const prompt = resolveSystemPrompt(tempDir);
    expect(prompt).toBe('You are a math tutor.');
  });

  it('falls back to default when system-prompt.md is empty', () => {
    writeFileSync(join(tempDir, 'system-prompt.md'), '   \n  ');
    const prompt = resolveSystemPrompt(tempDir);
    expect(prompt).toBe(getSystemPrompt());
  });
});

describe('resolveSystemPrompt with sessionId', () => {
  it('appends session-prompt.md content to global prompt', () => {
    const sessionId = 'test-session';
    mkdirSync(join(tempDir, sessionId), { recursive: true });
    writeFileSync(join(tempDir, sessionId, 'session-prompt.md'), '该学生是物理专业');

    const prompt = resolveSystemPrompt(tempDir, sessionId);
    expect(prompt).toContain('Teacher Agent');
    expect(prompt).toContain('## Session 指令');
    expect(prompt).toContain('该学生是物理专业');
  });

  it('returns only global prompt when session-prompt.md absent', () => {
    const prompt = resolveSystemPrompt(tempDir, 'no-such-session');
    expect(prompt).toBe(resolveSystemPrompt(tempDir));
  });

  it('returns only global prompt when session-prompt.md is empty', () => {
    const sessionId = 'test-session-2';
    mkdirSync(join(tempDir, sessionId), { recursive: true });
    writeFileSync(join(tempDir, sessionId, 'session-prompt.md'), '   ');

    const prompt = resolveSystemPrompt(tempDir, sessionId);
    expect(prompt).not.toContain('Session 指令');
  });
});
