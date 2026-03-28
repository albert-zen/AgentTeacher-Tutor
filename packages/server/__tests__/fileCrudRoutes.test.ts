import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import request from 'supertest';
import { Store } from '../src/db/index.js';
import { createFilesRouter } from '../src/routes/files.js';
import { createSessionRouter } from '../src/routes/session.js';

const mockEnsureReady = vi.fn(async () => ({
  status: 'ready' as const,
  message: 'Local search stack is ready.',
  updatedAt: new Date().toISOString(),
}));

vi.mock('../src/services/toolRuntimeManager.js', () => ({
  getToolRuntimeManager: () => ({
    getSnapshot: (_toolId: string, enabled: boolean) => ({
      status: enabled ? ('stopped' as const) : ('disabled' as const),
      updatedAt: new Date().toISOString(),
    }),
    ensureReady: (...args: unknown[]) => mockEnsureReady(...args),
    start: (...args: unknown[]) => mockEnsureReady(...args),
    stop: vi.fn(async () => ({
      status: 'stopped' as const,
      message: 'Runtime stopped.',
      updatedAt: new Date().toISOString(),
    })),
    restart: (...args: unknown[]) => mockEnsureReady(...args),
    check: vi.fn(async () => ({
      status: 'stopped' as const,
      updatedAt: new Date().toISOString(),
    })),
  }),
}));

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
  mockEnsureReady.mockClear();
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

describe('Session draft routes', () => {
  it('GET /api/session-draft returns the default draft when no file exists', async () => {
    const res = await request(app).get('/api/session-draft');
    expect(res.status).toBe(200);
    expect(res.body.manifest.profileSelection).toEqual({ mode: 'inherit_all' });
    expect(res.body.manifest.enabledTools).toEqual(['read_file', 'write_file', 'fetch_url']);
    expect(res.body.sessionPrompt).toBe('');
  });

  it('PUT /api/session-draft saves and GET returns it', async () => {
    const put = await request(app).put('/api/session-draft').send({
      manifest: {
        version: 1,
        profileSelection: { mode: 'explicit', blockIds: ['学习目标'] },
        enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
      },
      sessionPrompt: '多用物理类比',
    });
    expect(put.status).toBe(200);
    expect(put.body.sessionPrompt).toBe('多用物理类比');

    const get = await request(app).get('/api/session-draft');
    expect(get.body.sessionPrompt).toBe('多用物理类比');
    expect(get.body.manifest.profileSelection).toEqual({ mode: 'explicit', blockIds: ['学习目标'] });
  });
});

describe('Tool manager routes', () => {
  it('GET /api/tools returns the visible tools and global config', async () => {
    const res = await request(app).get('/api/tools');
    expect(res.status).toBe(200);
    expect(res.body.tools.map((tool: { id: string }) => tool.id)).toEqual(['read_file', 'write_file', 'fetch_url', 'web_search']);
    expect(res.body.globalConfig.tools.web_search.runtimeMode).toBeDefined();
  });

  it('GET /api/tools auto-starts local search runtime when web_search is enabled in the draft', async () => {
    await request(app).put('/api/session-draft').send({
      manifest: {
        version: 1,
        profileSelection: { mode: 'inherit_all' },
        enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
      },
      sessionPrompt: '',
    });

    const res = await request(app).get('/api/tools');
    expect(res.status).toBe(200);
    expect(mockEnsureReady).toHaveBeenCalledWith(
      'web_search',
      expect.objectContaining({
        runtimeMode: 'local',
      }),
    );
  });

  it('PUT /api/tools/:id persists global tool config', async () => {
    const put = await request(app).put('/api/tools/web_search').send({
      runtimeMode: 'external',
      externalBaseURL: 'http://localhost:9999',
      defaultMaxResults: 7,
      timeoutMs: 9000,
    });
    expect(put.status).toBe(200);
    expect(put.body.globalConfig.tools.web_search.externalBaseURL).toBe('http://localhost:9999');

    const get = await request(app).get('/api/tools');
    expect(get.body.globalConfig.tools.web_search.defaultMaxResults).toBe(7);
  });

  it('GET /api/session/:id/tools returns effective tool states and overrides', async () => {
    await request(app).put('/api/session-draft').send({
      manifest: {
        version: 1,
        profileSelection: { mode: 'inherit_all' },
        enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
      },
      sessionPrompt: '',
    });
    const id = await createTestSession();

    const res = await request(app).get(`/api/session/${id}/tools`);
    expect(res.status).toBe(200);
    expect(res.body.sessionConfig.enabledTools).toContain('web_search');
    expect(res.body.tools.find((tool: { id: string; enabled: boolean }) => tool.id === 'web_search').enabled).toBe(true);
  });

  it('PUT /api/session/:id/tools updates the session tool snapshot', async () => {
    await request(app).put('/api/session-draft').send({
      manifest: {
        version: 1,
        profileSelection: { mode: 'inherit_all' },
        enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
      },
      sessionPrompt: '',
    });
    const id = await createTestSession();

    const put = await request(app).put(`/api/session/${id}/tools`).send({
      toolId: 'web_search',
      enabled: false,
    });
    expect(put.status).toBe(200);
    expect(put.body.sessionConfig.enabledTools).not.toContain('web_search');
    expect(put.body.tools.find((tool: { id: string; enabled: boolean }) => tool.id === 'web_search').enabled).toBe(false);

    const enableAgain = await request(app).put(`/api/session/${id}/tools`).send({
      toolId: 'web_search',
      enabled: true,
    });
    expect(enableAgain.status).toBe(200);
    expect(enableAgain.body.sessionConfig.enabledTools).toContain('web_search');
    expect(enableAgain.body.tools.find((tool: { id: string; enabled: boolean }) => tool.id === 'web_search').enabled).toBe(true);
    expect(mockEnsureReady).toHaveBeenCalled();
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
