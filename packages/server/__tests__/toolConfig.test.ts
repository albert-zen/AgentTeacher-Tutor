import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { defaultToolConfig, loadToolConfig, updateToolConfig } from '../src/services/toolConfig.js';
import { loadSessionContext, saveSessionDraft, saveSessionContext } from '../src/services/sessionDraftService.js';

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
            externalBaseURL: 'http://old.local',
          },
        },
      }),
    );

    const config = loadToolConfig(tempDir);

    expect(config.tools.web_search.runtimeMode).toBe('local');
    expect(config.tools.web_search.externalBaseURL).toBe('http://old.local');
  });

  it('persists global runtime config without carrying draft enablement state', () => {
    saveSessionDraft(tempDir, {
      manifest: {
        version: 1,
        profileSelection: { mode: 'inherit_all' },
        enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
      },
      sessionPrompt: '',
    });

    updateToolConfig(tempDir, 'web_search', {
      runtimeMode: 'external',
      externalBaseURL: 'http://search.local',
      defaultMaxResults: 7,
    });

    const config = loadToolConfig(tempDir);
    expect(config.tools.web_search.runtimeMode).toBe('external');
    expect(config.tools.web_search.externalBaseURL).toBe('http://search.local');
    expect('enabledByDefault' in config.tools.web_search).toBe(false);
  });

  it('stores session tool visibility in session-context.json', () => {
    saveSessionDraft(tempDir, {
      manifest: {
        version: 1,
        profileSelection: { mode: 'inherit_all' },
        enabledTools: ['read_file', 'write_file', 'fetch_url', 'web_search'],
      },
      sessionPrompt: '',
    });

    saveSessionContext(tempDir, 'session-1', {
      version: 1,
      profileSelection: { mode: 'inherit_all' },
      enabledTools: ['read_file', 'write_file', 'fetch_url'],
    });

    const sessionConfig = loadSessionContext(tempDir, 'session-1');
    expect(sessionConfig.enabledTools).not.toContain('web_search');
    expect(sessionConfig.enabledTools).toContain('read_file');
  });
});
