import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileService } from '../src/services/fileService.js';

let tempDir: string;
let svc: FileService;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-test-'));
  svc = new FileService(tempDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('write_file', () => {
  it('创建新文件 — 路径不存在时创建文件并写入全部内容', () => {
    svc.writeFile({ path: 'guidance.md', content: '# Hello\nWorld' });
    const result = svc.readFile({ path: 'guidance.md' });
    expect(result.content).toBe('# Hello\nWorld');
    expect(result.totalLines).toBe(2);
  });

  it('覆盖整个文件 — 不传行号时替换文件全部内容', () => {
    svc.writeFile({ path: 'test.md', content: 'line1\nline2\nline3' });
    svc.writeFile({ path: 'test.md', content: 'new content' });
    const result = svc.readFile({ path: 'test.md' });
    expect(result.content).toBe('new content');
  });

  it('行级替换 — 传 startLine/endLine 时只替换指定行，其余不变', () => {
    svc.writeFile({ path: 'test.md', content: 'L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10' });
    svc.writeFile({ path: 'test.md', content: 'NEW_A\nNEW_B', startLine: 3, endLine: 5 });
    const result = svc.readFile({ path: 'test.md' });
    const lines = result.content.split('\n');
    expect(lines).toEqual(['L1', 'L2', 'NEW_A', 'NEW_B', 'L6', 'L7', 'L8', 'L9', 'L10']);
    expect(result.totalLines).toBe(9);
  });

  it('行级替换边界 — startLine=1 替换文件开头', () => {
    svc.writeFile({ path: 'test.md', content: 'A\nB\nC\nD' });
    svc.writeFile({ path: 'test.md', content: 'X\nY', startLine: 1, endLine: 2 });
    const result = svc.readFile({ path: 'test.md' });
    expect(result.content).toBe('X\nY\nC\nD');
  });

  it('行级替换边界 — endLine=最后一行 替换文件末尾', () => {
    svc.writeFile({ path: 'test.md', content: 'A\nB\nC\nD' });
    svc.writeFile({ path: 'test.md', content: 'X', startLine: 3, endLine: 4 });
    const result = svc.readFile({ path: 'test.md' });
    expect(result.content).toBe('A\nB\nX');
  });

  it('行号越界 — endLine 超出文件总行数时应报错', () => {
    svc.writeFile({ path: 'test.md', content: 'A\nB' });
    expect(() => {
      svc.writeFile({ path: 'test.md', content: 'X', startLine: 1, endLine: 10 });
    }).toThrow();
  });

  it('行号非法 — startLine > endLine 时应报错', () => {
    svc.writeFile({ path: 'test.md', content: 'A\nB\nC' });
    expect(() => {
      svc.writeFile({ path: 'test.md', content: 'X', startLine: 3, endLine: 1 });
    }).toThrow();
  });

  it('创建子目录文件 — 自动创建中间目录', () => {
    svc.writeFile({ path: 'notes/sub/draft.md', content: 'nested' });
    const result = svc.readFile({ path: 'notes/sub/draft.md' });
    expect(result.content).toBe('nested');
  });
});

describe('read_file', () => {
  it('读取整个文件 — 不传行号返回全部内容', () => {
    svc.writeFile({ path: 'test.md', content: 'A\nB\nC' });
    const result = svc.readFile({ path: 'test.md' });
    expect(result.content).toBe('A\nB\nC');
    expect(result.totalLines).toBe(3);
  });

  it('读取行范围 — 传 startLine/endLine 返回指定行', () => {
    svc.writeFile({ path: 'test.md', content: 'L1\nL2\nL3\nL4\nL5' });
    const result = svc.readFile({ path: 'test.md', startLine: 2, endLine: 4 });
    expect(result.content).toBe('L2\nL3\nL4');
    expect(result.totalLines).toBe(5);
  });

  it('文件不存在 — 抛出错误', () => {
    expect(() => svc.readFile({ path: 'nope.md' })).toThrow();
  });

  it('行号越界 — 超出范围时返回实际可用行', () => {
    svc.writeFile({ path: 'test.md', content: 'A\nB' });
    const result = svc.readFile({ path: 'test.md', startLine: 1, endLine: 100 });
    expect(result.content).toBe('A\nB');
  });
});

describe('trailing newline handling', () => {
  it('readFile — file with trailing newline reports correct totalLines', () => {
    svc.writeFile({ path: 'test.md', content: 'A\nB\n' });
    const result = svc.readFile({ path: 'test.md' });
    expect(result.totalLines).toBe(2);
    expect(result.content).toBe('A\nB');
  });

  it('readFile — file with trailing newline returns correct line range', () => {
    svc.writeFile({ path: 'test.md', content: 'A\nB\nC\n' });
    const result = svc.readFile({ path: 'test.md', startLine: 2, endLine: 3 });
    expect(result.content).toBe('B\nC');
    expect(result.totalLines).toBe(3);
  });

  it('writeFile — line replacement preserves trailing newline on disk', () => {
    svc.writeFile({ path: 'test.md', content: 'A\nB\nC\n' });
    svc.writeFile({ path: 'test.md', content: 'X', startLine: 2, endLine: 2 });
    const result = svc.readFile({ path: 'test.md' });
    expect(result.content).toBe('A\nX\nC');
    expect(result.totalLines).toBe(3);
  });

  it('writeFile — line replacement works without trailing newline', () => {
    svc.writeFile({ path: 'test.md', content: 'A\nB\nC' });
    svc.writeFile({ path: 'test.md', content: 'X', startLine: 2, endLine: 2 });
    const result = svc.readFile({ path: 'test.md' });
    expect(result.content).toBe('A\nX\nC');
    expect(result.totalLines).toBe(3);
  });

  it('empty file has totalLines 0', () => {
    svc.writeFile({ path: 'test.md', content: '' });
    const result = svc.readFile({ path: 'test.md' });
    expect(result.content).toBe('');
    expect(result.totalLines).toBe(0);
  });

  it('single line file without newline has totalLines 1', () => {
    svc.writeFile({ path: 'test.md', content: 'Hello' });
    const result = svc.readFile({ path: 'test.md' });
    expect(result.content).toBe('Hello');
    expect(result.totalLines).toBe(1);
  });

  it('single line file with trailing newline has totalLines 1', () => {
    svc.writeFile({ path: 'test.md', content: 'Hello\n' });
    const result = svc.readFile({ path: 'test.md' });
    expect(result.content).toBe('Hello');
    expect(result.totalLines).toBe(1);
  });

  it('endLine validation uses real line count, not phantom', () => {
    svc.writeFile({ path: 'test.md', content: 'A\nB\n' });
    expect(() => {
      svc.writeFile({ path: 'test.md', content: 'X', startLine: 1, endLine: 3 });
    }).toThrow();
  });

  it('line replacement at end of file with trailing newline', () => {
    svc.writeFile({ path: 'test.md', content: 'A\nB\nC\n' });
    svc.writeFile({ path: 'test.md', content: 'X', startLine: 3, endLine: 3 });
    const result = svc.readFile({ path: 'test.md' });
    expect(result.content).toBe('A\nB\nX');
    expect(result.totalLines).toBe(3);
  });

  it('line replacement on empty file throws', () => {
    svc.writeFile({ path: 'test.md', content: '' });
    expect(() => {
      svc.writeFile({ path: 'test.md', content: 'X', startLine: 1, endLine: 1 });
    }).toThrow();
  });
});
