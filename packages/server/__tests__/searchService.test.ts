import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { updateToolConfig } from '../src/services/toolConfig.js';
import { saveSessionContext, saveSessionDraft } from '../src/services/sessionDraftService.js';

const runtimeManager = {
  getSnapshot: vi.fn(),
  ensureReady: vi.fn(),
  check: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
};

vi.mock('../src/services/toolRuntimeManager.js', () => ({
  getToolRuntimeManager: () => runtimeManager,
}));

import { searchWeb } from '../src/services/searchService.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-search-service-'));
  mkdirSync(join(tempDir, 'session-1'), { recursive: true });
  saveSessionDraft(tempDir, {
    manifest: {
      version: 1,
      profileSelection: { mode: 'inherit_all' },
      enabledTools: ['read_file', 'write_file', 'fetch_url'],
    },
    sessionPrompt: '',
  });
  saveSessionContext(tempDir, 'session-1', {
    version: 1,
    profileSelection: { mode: 'inherit_all' },
    enabledTools: ['read_file', 'write_file', 'fetch_url'],
  });
  vi.restoreAllMocks();
  runtimeManager.getSnapshot.mockReturnValue({ status: 'stopped', updatedAt: new Date().toISOString() });
  runtimeManager.ensureReady.mockResolvedValue({ status: 'ready', updatedAt: new Date().toISOString() });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('searchService', () => {
  it('returns an explicit disabled error when web_search is turned off for the session', async () => {
    updateToolConfig(tempDir, 'web_search', { runtimeMode: 'local' });

    const result = await searchWeb(tempDir, 'session-1', { query: 'react compiler' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  });

  it('uses session context and normalizes external SearXNG results', async () => {
    updateToolConfig(tempDir, 'web_search', {
      runtimeMode: 'external',
      externalBaseURL: 'http://search.local',
      defaultMaxResults: 5,
      sidecar: { port: 19080 },
    });
    saveSessionContext(tempDir, 'session-1', {
      version: 1,
      profileSelection: { mode: 'inherit_all' },
      enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        provider: 'searxng',
        results: [
          {
            title: 'React Compiler',
            url: 'https://react.dev/compiler',
            snippet: 'Official docs',
            source: 'duckduckgo',
            publishedAt: '2026-03-26T00:00:00Z',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchWeb(tempDir, 'session-1', { query: 'react compiler latest docs' });

    expect(runtimeManager.ensureReady).toHaveBeenCalledWith(
      'web_search',
      expect.objectContaining({ runtimeMode: 'external', externalBaseURL: 'http://search.local' }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://127.0.0.1:19080/search');
    expect(result.success).toBe(true);
    expect(result.data?.provider).toBe('searxng');
  });

  it('uses the local sidecar and lazy-start readiness check when configured', async () => {
    updateToolConfig(tempDir, 'web_search', {
      runtimeMode: 'local',
      sidecar: { port: 18081 },
      backend: { port: 18082 },
    });
    saveSessionContext(tempDir, 'session-1', {
      version: 1,
      profileSelection: { mode: 'inherit_all' },
      enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        provider: 'searxng',
        results: [{ title: 'OpenClaw', url: 'https://example.com/openclaw', snippet: 'news', source: 'searxng' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchWeb(tempDir, 'session-1', { query: 'OpenClaw' });

    expect(runtimeManager.ensureReady).toHaveBeenCalledWith(
      'web_search',
      expect.objectContaining({ runtimeMode: 'local' }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://127.0.0.1:18081/search');
    expect(result.success).toBe(true);
  });

  it('returns the runtime error when the local sidecar cannot be started', async () => {
    updateToolConfig(tempDir, 'web_search', { runtimeMode: 'local' });
    saveSessionContext(tempDir, 'session-1', {
      version: 1,
      profileSelection: { mode: 'inherit_all' },
      enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
    });
    runtimeManager.ensureReady.mockResolvedValue({
      status: 'error',
      message: 'Local web search runtime is not ready.',
      updatedAt: new Date().toISOString(),
    });

    const result = await searchWeb(tempDir, 'session-1', { query: 'broken' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not ready');
  });

  it('rejects custom engines in local mode', async () => {
    updateToolConfig(tempDir, 'web_search', { runtimeMode: 'local' });
    saveSessionContext(tempDir, 'session-1', {
      version: 1,
      profileSelection: { mode: 'inherit_all' },
      enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
    });

    const result = await searchWeb(tempDir, 'session-1', { query: 'OpenClaw', engines: ['google'] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not support custom engines');
  });
});
