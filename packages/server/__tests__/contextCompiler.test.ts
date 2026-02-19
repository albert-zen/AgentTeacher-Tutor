import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { assembleContext } from '../src/services/contextAssembler.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-ctx-'));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('assembleContext', () => {
  it('includes system prompt from resolveSystemPrompt', () => {
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const ctx = assembleContext(tempDir, 'sess1');
    expect(ctx.systemPrompt).toContain('Teacher Agent');
  });

  it('includes all profile blocks by default', () => {
    writeFileSync(join(tempDir, 'profile.md'), '# Info\ndata\n# Goals\nlearn');
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const ctx = assembleContext(tempDir, 'sess1');
    expect(ctx.profileBlocks).toHaveLength(2);
    expect(ctx.selectedProfileContent).toContain('Info');
    expect(ctx.selectedProfileContent).toContain('Goals');
  });

  it('filters profile blocks when config specifies ids', () => {
    writeFileSync(join(tempDir, 'profile.md'), '# Info\ndata\n# Goals\nlearn');
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const ctx = assembleContext(tempDir, 'sess1', { profileBlockIds: ['Goals'] });
    expect(ctx.selectedProfileContent).not.toContain('Info');
    expect(ctx.selectedProfileContent).toContain('Goals');
  });

  it('returns empty profile when no profile.md', () => {
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const ctx = assembleContext(tempDir, 'sess1');
    expect(ctx.profileBlocks).toEqual([]);
    expect(ctx.selectedProfileContent).toBe('');
  });

  it('appends session prompt to system prompt', () => {
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    writeFileSync(join(tempDir, 'sess1', 'session-prompt.md'), '多用公式推导');
    const ctx = assembleContext(tempDir, 'sess1');
    expect(ctx.systemPrompt).toContain('多用公式推导');
  });

  it('is deterministic: same inputs produce same output', () => {
    writeFileSync(join(tempDir, 'profile.md'), '# A\ndata');
    mkdirSync(join(tempDir, 'sess1'), { recursive: true });
    const ctx1 = assembleContext(tempDir, 'sess1');
    const ctx2 = assembleContext(tempDir, 'sess1');
    expect(ctx1).toEqual(ctx2);
  });
});
