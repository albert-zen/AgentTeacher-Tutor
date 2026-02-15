import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileService } from '../src/services/fileService.js';
import { getToolDefinitions, executeToolCall } from '../src/services/teacher.js';

let tempDir: string;
let fileService: FileService;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-tools-test-'));
  fileService = new FileService(tempDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('tool 定义', () => {
  it('read_file 和 write_file 的定义包含正确的参数 schema', () => {
    const tools = getToolDefinitions();
    const names = tools.map((t) => t.name);
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');

    const writeTool = tools.find((t) => t.name === 'write_file')!;
    expect(writeTool.parameters.properties).toHaveProperty('path');
    expect(writeTool.parameters.properties).toHaveProperty('content');
    expect(writeTool.parameters.properties).toHaveProperty('startLine');
    expect(writeTool.parameters.properties).toHaveProperty('endLine');
    expect(writeTool.parameters.required).toContain('path');
    expect(writeTool.parameters.required).toContain('content');

    const readTool = tools.find((t) => t.name === 'read_file')!;
    expect(readTool.parameters.properties).toHaveProperty('path');
    expect(readTool.parameters.properties).toHaveProperty('startLine');
    expect(readTool.parameters.properties).toHaveProperty('endLine');
    expect(readTool.parameters.required).toContain('path');
  });
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
