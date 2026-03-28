import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileService } from '../src/services/fileService.js';
import { buildTools } from '../src/services/llm.js';

let tempDir: string;
let fileService: FileService;
let tools: ReturnType<typeof buildTools>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-tools-test-'));
  fileService = new FileService(tempDir);
  tools = buildTools(fileService, tempDir, 'session-1', ['read_file', 'write_file', 'fetch_url']);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('tool 执行', () => {
  it('write_file 不带行号 — 创建新文件', async () => {
    const result = await tools.write_file.execute(
      { path: 'guidance.md', content: '# Guide\nHello' },
      { toolCallId: 't1', messages: [], abortSignal: undefined as never },
    );
    expect(result.success).toBe(true);
    const file = fileService.readFile({ path: 'guidance.md' });
    expect(file.content).toBe('# Guide\nHello');
  });

  it('write_file 带行号 — 修改已有文件的指定行', async () => {
    fileService.writeFile({ path: 'test.md', content: 'A\nB\nC\nD' });
    const result = await tools.write_file.execute(
      { path: 'test.md', content: 'X\nY', startLine: 2, endLine: 3 },
      { toolCallId: 't2', messages: [], abortSignal: undefined as never },
    );
    expect(result.success).toBe(true);
    const file = fileService.readFile({ path: 'test.md' });
    expect(file.content).toBe('A\nX\nY\nD');
  });

  it('read_file — 返回文件内容', async () => {
    fileService.writeFile({ path: 'test.md', content: 'Hello\nWorld' });
    const result = await tools.read_file.execute(
      { path: 'test.md' },
      { toolCallId: 't3', messages: [], abortSignal: undefined as never },
    );
    expect(result.success).toBe(true);
    expect((result as { data: { content: string } }).data.content).toBe('Hello\nWorld');
  });

  it('write_file 路径安全 — 拒绝 session 目录外的路径', async () => {
    const result = await tools.write_file.execute(
      { path: '../../etc/passwd', content: 'hacked' },
      { toolCallId: 't4', messages: [], abortSignal: undefined as never },
    );
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/path/i);
  });

  it('read_file 路径安全 — 拒绝 session 目录外的路径', async () => {
    const result = await tools.read_file.execute(
      { path: '../../../secret.txt' },
      { toolCallId: 't5', messages: [], abortSignal: undefined as never },
    );
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/path/i);
  });

  it('can exclude tools from the registry when they are disabled', () => {
    const limitedTools = buildTools(fileService, tempDir, 'session-1', ['read_file']);
    expect(limitedTools.read_file).toBeDefined();
    expect('write_file' in limitedTools).toBe(false);
    expect('fetch_url' in limitedTools).toBe(false);
    expect('web_search' in limitedTools).toBe(false);
  });

  it('fetch_url — 返回网页正文内容', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null),
        },
        text: async () => '<html><head><title>Doc</title></head><body><main>Alpha Beta</main></body></html>',
      }),
    );

    const result = await tools.fetch_url.execute(
      { url: 'https://example.com/doc' },
      { toolCallId: 't6', messages: [], abortSignal: undefined as never },
    );

    expect(result.success).toBe(true);
    expect((result as { data: { title?: string; content: string } }).data.title).toBe('Doc');
    expect((result as { data: { title?: string; content: string } }).data.content).toContain('Alpha Beta');
  });
});
