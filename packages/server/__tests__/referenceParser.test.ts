import { describe, it, expect } from 'vitest';
import { parseReferences, generateReference } from '../src/services/referenceParser.js';

describe('解析引用', () => {
  it('解析完整引用 [guidance.md:12:15]', () => {
    const refs = parseReferences('看看 [guidance.md:12:15] 这部分');
    expect(refs).toEqual([{ file: 'guidance.md', startLine: 12, endLine: 15 }]);
  });

  it('解析仅文件名引用 [guidance.md]', () => {
    const refs = parseReferences('请看 [guidance.md]');
    expect(refs).toEqual([{ file: 'guidance.md', startLine: undefined, endLine: undefined }]);
  });

  it('从消息文本中提取多个引用', () => {
    const refs = parseReferences('对比 [guidance.md:1:5] 和 [ground-truth.md:10:20] 的区别');
    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual({ file: 'guidance.md', startLine: 1, endLine: 5 });
    expect(refs[1]).toEqual({ file: 'ground-truth.md', startLine: 10, endLine: 20 });
  });

  it('忽略不合法格式', () => {
    const refs = parseReferences('这是 [notafile] 和 [.md:abc:def] 不该匹配');
    expect(refs).toHaveLength(0);
  });

  it('支持子目录路径 [notes/draft.md:1:3]', () => {
    const refs = parseReferences('看 [notes/draft.md:1:3]');
    expect(refs).toEqual([{ file: 'notes/draft.md', startLine: 1, endLine: 3 }]);
  });

  it('无引用时返回空数组', () => {
    const refs = parseReferences('这段话没有引用任何文件');
    expect(refs).toHaveLength(0);
  });
});

describe('生成引用', () => {
  it('从选区信息生成完整引用字符串', () => {
    const ref = generateReference({ file: 'guidance.md', startLine: 3, endLine: 7 });
    expect(ref).toBe('[guidance.md:3:7]');
  });

  it('仅文件名时不带行号', () => {
    const ref = generateReference({ file: 'guidance.md' });
    expect(ref).toBe('[guidance.md]');
  });
});
