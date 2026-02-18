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
});
