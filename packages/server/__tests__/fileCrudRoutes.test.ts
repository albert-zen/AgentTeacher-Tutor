import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import request from 'supertest';
import { Store } from '../src/db/index.js';
import { createFilesRouter } from '../src/routes/files.js';
import { createSessionRouter } from '../src/routes/session.js';

let tempDir: string;
let app: express.Express;
let store: Store;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-file-routes-'));
  store = new Store(tempDir);
  app = express();
  app.use(express.json());
  app.use('/api/session', createSessionRouter(store, tempDir));
  app.use('/api', createFilesRouter(store, tempDir));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

async function createTestSession(): Promise<string> {
  const res = await request(app).post('/api/session').send({ concept: 'test' });
  return res.body.id;
}

describe('Profile routes', () => {
  // E8
  it('GET /api/profile returns content when file exists', async () => {
    writeFileSync(join(tempDir, 'profile.md'), '# My Profile\nHello');
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('# My Profile\nHello');
    expect(res.body.totalLines).toBe(2);
  });

  // E9
  it('GET /api/profile returns empty when file absent', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('');
    expect(res.body.totalLines).toBe(0);
  });

  // E10
  it('PUT /api/profile writes file and returns success', async () => {
    const res = await request(app).put('/api/profile').send({ content: '# Updated Profile' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const get = await request(app).get('/api/profile');
    expect(get.body.content).toBe('# Updated Profile');
  });
});

describe('Session prompt draft routes', () => {
  it('GET /api/session-prompt-draft returns empty when no draft exists', async () => {
    const res = await request(app).get('/api/session-prompt-draft');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('');
    expect(res.body.totalLines).toBe(0);
  });

  it('PUT /api/session-prompt-draft saves and GET returns it', async () => {
    const put = await request(app).put('/api/session-prompt-draft').send({ content: '多用物理类比' });
    expect(put.status).toBe(200);
    expect(put.body.success).toBe(true);

    const get = await request(app).get('/api/session-prompt-draft');
    expect(get.body.content).toBe('多用物理类比');
  });
});

describe('Search config routes', () => {
  it('GET /api/search-config returns defaults when no config exists', async () => {
    const res = await request(app).get('/api/search-config');
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('searxng');
    expect(res.body.enabled).toBe(false);
  });

  it('PUT /api/search-config persists global search config', async () => {
    const put = await request(app).put('/api/search-config').send({
      enabled: true,
      baseURL: 'http://localhost:9999',
      defaultMaxResults: 7,
      timeoutMs: 9000,
    });
    expect(put.status).toBe(200);
    expect(put.body.enabled).toBe(true);
    expect(put.body.baseURL).toBe('http://localhost:9999');

    const get = await request(app).get('/api/search-config');
    expect(get.body.enabled).toBe(true);
    expect(get.body.defaultMaxResults).toBe(7);
  });

  it('GET /api/session/:id/search-config returns effective config and override metadata', async () => {
    const id = await createTestSession();
    await request(app).put('/api/search-config').send({ enabled: true });

    const res = await request(app).get(`/api/session/${id}/search-config`);
    expect(res.status).toBe(200);
    expect(res.body.override).toBe(false);
    expect(res.body.localConfig).toBeNull();
    expect(res.body.effectiveConfig.enabled).toBe(true);
  });

  it('PUT /api/session/:id/search-config saves and clears a session override', async () => {
    const id = await createTestSession();
    await request(app).put('/api/search-config').send({ enabled: true });

    const put = await request(app).put(`/api/session/${id}/search-config`).send({
      override: true,
      enabled: false,
    });
    expect(put.status).toBe(200);
    expect(put.body.override).toBe(true);
    expect(put.body.localConfig).toEqual({ enabled: false });
    expect(put.body.effectiveConfig.enabled).toBe(false);

    const clear = await request(app).put(`/api/session/${id}/search-config`).send({ override: false });
    expect(clear.status).toBe(200);
    expect(clear.body.override).toBe(false);
    expect(clear.body.localConfig).toBeNull();
    expect(clear.body.effectiveConfig.enabled).toBe(true);
  });
});

describe('File CRUD routes', () => {
  // E11
  it('GET /:sessionId/files returns all files, excluding messages.json and dotfiles', async () => {
    const id = await createTestSession();
    const sessionDir = join(tempDir, id);
    writeFileSync(join(sessionDir, 'guidance.md'), 'content');
    writeFileSync(join(sessionDir, 'notes.md'), 'content');
    writeFileSync(join(sessionDir, '.hidden'), 'content');
    writeFileSync(join(sessionDir, 'messages.json'), '[]');

    const res = await request(app).get(`/api/${id}/files`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('guidance.md');
    expect(res.body).toContain('notes.md');
    expect(res.body).not.toContain('messages.json');
    expect(res.body).not.toContain('.hidden');
  });

  // E12
  it('GET /:sessionId/file?path= returns file content', async () => {
    const id = await createTestSession();
    writeFileSync(join(tempDir, id, 'test.md'), 'line1\nline2\nline3');

    const res = await request(app).get(`/api/${id}/file`).query({ path: 'test.md' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('line1\nline2\nline3');
    expect(res.body.totalLines).toBe(3);
  });

  // E13
  it('PUT /:sessionId/file writes file', async () => {
    const id = await createTestSession();
    const res = await request(app).put(`/api/${id}/file`).send({ path: 'newfile.md', content: 'Hello world' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const get = await request(app).get(`/api/${id}/file`).query({ path: 'newfile.md' });
    expect(get.body.content).toBe('Hello world');
  });

  // E14
  it('DELETE /:sessionId/file removes file', async () => {
    const id = await createTestSession();
    writeFileSync(join(tempDir, id, 'todelete.md'), 'bye');

    const res = await request(app).delete(`/api/${id}/file`).query({ path: 'todelete.md' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const get = await request(app).get(`/api/${id}/file`).query({ path: 'todelete.md' });
    expect(get.status).toBe(404);
  });

  // X2
  it('GET /:sessionId/files returns 404 for non-existent directory', async () => {
    const res = await request(app).get('/api/nonexistent/files');
    expect(res.status).toBe(404);
  });

  // X3
  it('GET /:sessionId/file without path param returns 400', async () => {
    const id = await createTestSession();
    const res = await request(app).get(`/api/${id}/file`);
    expect(res.status).toBe(400);
  });

  // X4
  it('DELETE non-existent file returns 404', async () => {
    const id = await createTestSession();
    const res = await request(app).delete(`/api/${id}/file`).query({ path: 'nosuchfile.md' });
    expect(res.status).toBe(404);
  });

  it('DELETE with path traversal returns 400', async () => {
    const id = await createTestSession();
    const res = await request(app).delete(`/api/${id}/file`).query({ path: '../../etc/passwd' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Path traversal not allowed');
  });
});
