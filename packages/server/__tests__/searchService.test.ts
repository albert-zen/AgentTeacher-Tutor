import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { updateSessionToolOverride, updateToolConfig } from '../src/services/toolConfig.js';

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
  vi.restoreAllMocks();
  runtimeManager.getSnapshot.mockReturnValue({ status: 'stopped', updatedAt: new Date().toISOString() });
  runtimeManager.ensureReady.mockResolvedValue({ status: 'ready', updatedAt: new Date().toISOString() });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('searchService', () => {
  it('returns an explicit disabled error when web_search is turned off', async () => {
    updateToolConfig(tempDir, 'web_search', { enabledByDefault: false });

    const result = await searchWeb(tempDir, 'session-1', { query: 'react compiler' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  });

  it('uses session overrides and normalizes external SearXNG results', async () => {
    updateToolConfig(tempDir, 'web_search', {
      enabledByDefault: false,
      runtimeMode: 'external',
      upstream: { provider: 'searxng', remoteBaseURL: 'http://search.local' },
      defaultMaxResults: 5,
    });
    updateSessionToolOverride(tempDir, 'session-1', 'web_search', { enabled: true });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'React Compiler',
            url: 'https://react.dev/compiler',
            content: 'Official docs',
            engine: 'duckduckgo',
            publishedDate: '2026-03-26T00:00:00Z',
          },
          {
            title: 'React Compiler',
            url: 'https://react.dev/compiler',
            content: 'Duplicate',
            engine: 'google',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchWeb(tempDir, 'session-1', { query: 'react compiler latest docs' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://search.local/search?q=react+compiler+latest+docs&format=json&categories=general',
    );
    expect(result.success).toBe(true);
    expect(result.data?.provider).toBe('searxng');
    expect(result.data?.results).toEqual([
      {
        title: 'React Compiler',
        url: 'https://react.dev/compiler',
        snippet: 'Official docs',
        source: 'duckduckgo',
        publishedAt: '2026-03-26T00:00:00Z',
      },
    ]);
  });

  it('uses the managed sidecar and lazy-start readiness check when configured', async () => {
    updateToolConfig(tempDir, 'web_search', {
      enabledByDefault: true,
      runtimeMode: 'managed',
      sidecar: { port: 18081 },
      backend: { port: 18082 },
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
      expect.objectContaining({ runtimeMode: 'managed' }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://127.0.0.1:18081/search');
    expect(result.success).toBe(true);
  });

  it('returns the runtime error when the managed sidecar cannot be started', async () => {
    updateToolConfig(tempDir, 'web_search', {
      enabledByDefault: true,
      runtimeMode: 'managed',
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
});
