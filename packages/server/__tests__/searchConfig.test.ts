import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  defaultToolConfig,
  loadSessionContextConfig,
  loadToolConfig,
  resolveToolEnabled,
  updateSessionToolOverride,
  updateToolConfig,
} from '../src/services/toolConfig.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-tool-config-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('toolConfig', () => {
  it('returns defaults when no tool config exists', () => {
    expect(loadToolConfig(tempDir)).toEqual(defaultToolConfig);
  });

  it('migrates legacy search-config.json into web_search settings', () => {
    writeFileSync(
      join(tempDir, 'search-config.json'),
      JSON.stringify({
        enabled: true,
        baseURL: 'http://legacy-search.local',
        defaultMaxResults: 7,
        timeoutMs: 5000,
      }),
    );

    const config = loadToolConfig(tempDir);

    expect(config.tools.web_search.enabledByDefault).toBe(true);
    expect(config.tools.web_search.runtimeMode).toBe('external');
    expect(config.tools.web_search.externalBaseURL).toBe('http://legacy-search.local');
    expect(config.tools.web_search.defaultMaxResults).toBe(7);
    expect(config.tools.web_search.timeoutMs).toBe(5000);
  });

  it('normalizes legacy managed tool-config.json into local mode', () => {
    writeFileSync(
      join(tempDir, 'tool-config.json'),
      JSON.stringify({
        version: 1,
        tools: {
          ...defaultToolConfig.tools,
          web_search: {
            ...defaultToolConfig.tools.web_search,
            runtimeMode: 'managed',
            upstream: { provider: 'searxng', remoteBaseURL: 'http://old.local' },
          },
        },
      }),
    );

    const config = loadToolConfig(tempDir);

    expect(config.tools.web_search.runtimeMode).toBe('local');
    expect(config.tools.web_search.externalBaseURL).toBe('http://old.local');
  });

  it('applies session tool overrides on top of global defaults', () => {
    updateToolConfig(tempDir, 'web_search', { enabledByDefault: true });
    updateSessionToolOverride(tempDir, 'session-1', 'web_search', { enabled: false });

    const globalConfig = loadToolConfig(tempDir);
    const sessionConfig = loadSessionContextConfig(tempDir, 'session-1');

    expect(resolveToolEnabled(globalConfig, sessionConfig, 'web_search')).toBe(false);
    expect(resolveToolEnabled(globalConfig, sessionConfig, 'read_file')).toBe(true);
  });
});
