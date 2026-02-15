import { describe, it, expect } from 'vitest';
import { parseMilestones, serializeMilestones } from '../src/services/milestonesParser.js';

describe('解析 milestones.md', () => {
  it('解析标题和所有里程碑项', () => {
    const md = `# 里程碑: 神经网络\n\n- [x] 激活函数\n- [ ] 反向传播`;
    const result = parseMilestones(md);
    expect(result.title).toBe('神经网络');
    expect(result.items).toEqual([
      { name: '激活函数', completed: true },
      { name: '反向传播', completed: false },
    ]);
  });

  it('全部完成', () => {
    const md = `# 里程碑: CSS\n\n- [x] 选择器\n- [x] 盒模型`;
    const result = parseMilestones(md);
    expect(result.items.every((i) => i.completed)).toBe(true);
  });

  it('空文件', () => {
    const result = parseMilestones('');
    expect(result.title).toBe('');
    expect(result.items).toEqual([]);
  });

  it('大写X也识别为完成', () => {
    const md = `# 里程碑: Test\n\n- [X] Item`;
    const result = parseMilestones(md);
    expect(result.items[0].completed).toBe(true);
  });

  it('没有checkbox的行被跳过', () => {
    const md = `# 里程碑: Test\n\n- [x] A\n- 没有checkbox\n- [ ] B`;
    const result = parseMilestones(md);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('A');
    expect(result.items[1].name).toBe('B');
  });
});

describe('序列化 milestones', () => {
  it('从结构化数据生成 milestones.md 内容', () => {
    const md = serializeMilestones({
      title: '神经网络',
      items: [
        { name: '激活函数', completed: true },
        { name: '反向传播', completed: false },
      ],
    });
    expect(md).toBe(`# 里程碑: 神经网络\n\n- [x] 激活函数\n- [ ] 反向传播`);
  });

  it('空 items 只输出标题', () => {
    const md = serializeMilestones({ title: 'Empty', items: [] });
    expect(md).toBe('# 里程碑: Empty');
  });

  it('序列化 → 解析 round-trip', () => {
    const original = {
      title: 'RT',
      items: [
        { name: 'A', completed: true },
        { name: 'B', completed: false },
        { name: 'C', completed: true },
      ],
    };
    const md = serializeMilestones(original);
    const parsed = parseMilestones(md);
    expect(parsed).toEqual(original);
  });
});
