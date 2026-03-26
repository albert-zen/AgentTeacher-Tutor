import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  clearSessionSearchConfig,
  defaultSearchConfig,
  loadSearchConfig,
  loadSessionSearchConfigOverride,
  saveSearchConfig,
  saveSessionSearchConfig,
} from '../src/services/searchConfig.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-search-config-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('searchConfig', () => {
  it('returns defaults when no config files exist', () => {
    expect(loadSearchConfig(tempDir)).toEqual(defaultSearchConfig);
  });

  it('merges global config with session overrides', () => {
    saveSearchConfig(tempDir, {
      enabled: true,
      baseURL: 'http://localhost:9999',
      defaultMaxResults: 7,
    });
    saveSessionSearchConfig(tempDir, 'session-1', {
      enabled: false,
      timeoutMs: 2000,
    });

    expect(loadSearchConfig(tempDir, 'session-1')).toMatchObject({
      enabled: false,
      baseURL: 'http://localhost:9999',
      defaultMaxResults: 7,
      timeoutMs: 2000,
    });
  });

  it('returns null when no session override exists and clears override files', () => {
    expect(loadSessionSearchConfigOverride(tempDir, 'session-1')).toBeNull();

    saveSessionSearchConfig(tempDir, 'session-1', { enabled: false });
    expect(loadSessionSearchConfigOverride(tempDir, 'session-1')).toEqual({ enabled: false });

    clearSessionSearchConfig(tempDir, 'session-1');
    expect(loadSessionSearchConfigOverride(tempDir, 'session-1')).toBeNull();
  });
});
