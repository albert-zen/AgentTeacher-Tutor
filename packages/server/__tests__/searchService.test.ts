import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { saveSearchConfig, saveSessionSearchConfig } from '../src/services/searchConfig.js';
import { searchWeb } from '../src/services/searchService.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-search-service-'));
  mkdirSync(join(tempDir, 'session-1'), { recursive: true });
  vi.restoreAllMocks();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('searchService', () => {
  it('returns an explicit disabled error when search is turned off', async () => {
    saveSearchConfig(tempDir, { enabled: false });

    const result = await searchWeb(tempDir, 'session-1', { query: 'react compiler' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  });

  it('uses session overrides and normalizes SearXNG results', async () => {
    saveSearchConfig(tempDir, {
      enabled: true,
      baseURL: 'http://search.local',
      defaultMaxResults: 5,
    });
    saveSessionSearchConfig(tempDir, 'session-1', {
      defaultMaxResults: 2,
    });

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

  it('passes category, engines, time range, and maxResults through to the provider', async () => {
    saveSearchConfig(tempDir, {
      enabled: true,
      baseURL: 'http://search.local',
      defaultMaxResults: 5,
      allowedCategories: ['general', 'news'],
      allowedEngines: ['bing', 'google'],
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchWeb(tempDir, 'session-1', {
      query: 'ai news',
      category: 'news',
      engines: ['google'],
      timeRange: 'day',
      maxResults: 1,
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://search.local/search?q=ai+news&format=json&categories=news&engines=google&time_range=day',
    );
  });

  it('returns a provider error for non-ok responses', async () => {
    saveSearchConfig(tempDir, {
      enabled: true,
      baseURL: 'http://search.local',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'boom',
      }),
    );

    const result = await searchWeb(tempDir, 'session-1', { query: 'broken' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });
});
