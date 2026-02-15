import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
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

  readFile(params: ReadFileParams): ReadFileResult {
    const { path: relPath, startLine, endLine } = params;
    const absPath = this.resolvePath(relPath);

    if (!existsSync(absPath)) {
      throw new Error('File not found');
    }

    const raw = readFileSync(absPath, 'utf-8');
    const lines = raw.split('\n');
    const totalLines = lines.length;

    if (startLine === undefined && endLine === undefined) {
      return { content: raw, totalLines };
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
      const lines = raw.split('\n');
      const totalLines = lines.length;
      if (endLine! > totalLines) {
        throw new Error('endLine exceeds file length');
      }
      const before = lines.slice(0, startLine! - 1);
      const after = lines.slice(endLine!);
      const newContent = content.endsWith('\n') ? content.slice(0, -1) : content;
      const newLines = newContent.split('\n');
      const result = [...before, ...newLines, ...after].join('\n');
      mkdirSync(resolve(absPath, '..'), { recursive: true });
      writeFileSync(absPath, result);
    } else {
      mkdirSync(resolve(absPath, '..'), { recursive: true });
      writeFileSync(absPath, content);
    }
  }
}
