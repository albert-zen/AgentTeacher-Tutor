import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { resolve, relative, isAbsolute } from 'path';
import type { ReadFileParams, WriteFileParams, ReadFileResult } from '../types.js';

/**
 * File read/write service that operates within a base directory (sandbox).
 * Line numbers are 1-based.
 */
export class FileService {
  constructor(private baseDir: string) {}

  /**
   * Resolves path within baseDir. Throws if path escapes sandbox (path traversal).
   */
  private resolvePath(relativePath: string): string {
    const normalized = relativePath.replace(/^[/\\]+/, '').replace(/[/\\]+/g, '/');
    const absPath = resolve(this.baseDir, normalized);
    const baseResolved = resolve(this.baseDir);
    const rel = relative(baseResolved, absPath);
    if (rel.startsWith('..') || rel === '..' || isAbsolute(rel)) {
      throw new Error('Path traversal not allowed');
    }
    return absPath;
  }

  /**
   * Split file content into lines, stripping the phantom empty element
   * caused by trailing newlines: "A\nB\n".split('\n') → ["A","B",""]
   */
  private splitLines(raw: string): string[] {
    if (raw === '') return [];
    const lines = raw.split('\n');
    if (raw.endsWith('\n') && lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines;
  }

  readFile(params: ReadFileParams): ReadFileResult {
    const { path: relPath, startLine, endLine } = params;
    const absPath = this.resolvePath(relPath);

    if (!existsSync(absPath)) {
      throw new Error('File not found');
    }

    const raw = readFileSync(absPath, 'utf-8');
    const lines = this.splitLines(raw);
    const totalLines = lines.length;

    if (startLine === undefined && endLine === undefined) {
      return { content: lines.join('\n'), totalLines };
    }

    const start = startLine ?? 1;
    const end = endLine ?? totalLines;
    const clampedEnd = Math.min(Math.max(end, 1), totalLines);
    const clampedStart = Math.min(Math.max(start, 1), totalLines);
    const selected = lines.slice(clampedStart - 1, clampedEnd);
    return {
      content: selected.join('\n'),
      totalLines,
    };
  }

  deleteFile(path: string): void {
    const absPath = this.resolvePath(path);
    if (!existsSync(absPath)) {
      throw new Error('File not found');
    }
    unlinkSync(absPath);
  }

  writeFile(params: WriteFileParams): void {
    const { path: relPath, content, startLine, endLine } = params;
    const absPath = this.resolvePath(relPath);

    const hasLineRange = startLine !== undefined && endLine !== undefined;

    if (hasLineRange) {
      if (startLine! > endLine!) {
        throw new Error('startLine cannot be greater than endLine');
      }
      if (!existsSync(absPath)) {
        throw new Error('Cannot replace lines in non-existent file');
      }
      const raw = readFileSync(absPath, 'utf-8');
      const hadTrailingNewline = raw.endsWith('\n');
      const lines = this.splitLines(raw);
      const totalLines = lines.length;
      if (startLine! < 1 || endLine! > totalLines) {
        throw new Error('endLine exceeds file length');
      }
      const before = lines.slice(0, startLine! - 1);
      const after = lines.slice(endLine!);
      const newContent = content.endsWith('\n') ? content.slice(0, -1) : content;
      const newLines = newContent.split('\n');
      let result = [...before, ...newLines, ...after].join('\n');
      if (hadTrailingNewline) {
        result += '\n';
      }
      mkdirSync(resolve(absPath, '..'), { recursive: true });
      writeFileSync(absPath, result);
    } else {
      mkdirSync(resolve(absPath, '..'), { recursive: true });
      writeFileSync(absPath, content);
    }
  }
}
