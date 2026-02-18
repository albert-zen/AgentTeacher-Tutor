import { describe, it, expect } from 'vitest';
import { parseProfileBlocks } from '../src/services/profileParser.js';

describe('parseProfileBlocks', () => {
  it('parses multiple heading blocks', () => {
    const content = '# 基本信息\n25岁\n\n# 学习目标\n深入理解分布式系统\n';
    const blocks = parseProfileBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ id: '基本信息', name: '基本信息', content: '25岁' });
    expect(blocks[1]).toEqual({
      id: '学习目标',
      name: '学习目标',
      content: '深入理解分布式系统',
    });
  });

  it('returns empty array for empty content', () => {
    expect(parseProfileBlocks('')).toEqual([]);
    expect(parseProfileBlocks('  \n  ')).toEqual([]);
  });

  it('ignores text before first heading', () => {
    const content = 'some preamble\n# First\ncontent\n';
    const blocks = parseProfileBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe('First');
  });

  it('handles single block', () => {
    const blocks = parseProfileBlocks('# Only\njust this');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe('just this');
  });
});
