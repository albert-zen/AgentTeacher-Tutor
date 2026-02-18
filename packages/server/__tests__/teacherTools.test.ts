import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileService } from '../src/services/fileService.js';
import { executeToolCall } from '../src/services/teacher.js';

let tempDir: string;
let fileService: FileService;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-tools-test-'));
  fileService = new FileService(tempDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('tool 执行', () => {
  it('write_file 不带行号 — 创建新文件', async () => {
    const result = await executeToolCall(fileService, 'write_file', {
      path: 'guidance.md',
      content: '# Guide\nHello',
    });
    expect(result.success).toBe(true);
    const file = fileService.readFile({ path: 'guidance.md' });
    expect(file.content).toBe('# Guide\nHello');
  });

  it('write_file 带行号 — 修改已有文件的指定行', async () => {
    fileService.writeFile({ path: 'test.md', content: 'A\nB\nC\nD' });
    const result = await executeToolCall(fileService, 'write_file', {
      path: 'test.md',
      content: 'X\nY',
      startLine: 2,
      endLine: 3,
    });
    expect(result.success).toBe(true);
    const file = fileService.readFile({ path: 'test.md' });
    expect(file.content).toBe('A\nX\nY\nD');
  });

  it('read_file — 返回文件内容', async () => {
    fileService.writeFile({ path: 'test.md', content: 'Hello\nWorld' });
    const result = await executeToolCall(fileService, 'read_file', {
      path: 'test.md',
    });
    expect(result.success).toBe(true);
    expect(result.data.content).toBe('Hello\nWorld');
  });

  it('write_file 路径安全 — 拒绝 session 目录外的路径', async () => {
    const result = await executeToolCall(fileService, 'write_file', {
      path: '../../etc/passwd',
      content: 'hacked',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/path/i);
  });

  it('read_file 路径安全 — 拒绝 session 目录外的路径', async () => {
    const result = await executeToolCall(fileService, 'read_file', {
      path: '../../../secret.txt',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/path/i);
  });

  it('未知工具名 — 返回错误', async () => {
    const result = await executeToolCall(fileService, 'unknown_tool', {});
    expect(result.success).toBe(false);
  });
});
