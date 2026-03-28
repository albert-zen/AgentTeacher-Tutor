// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ContextPreviewModal from '../src/components/ContextPreviewModal';

describe('ContextPreviewModal', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders sections and expands tool instructions plus history process blocks', async () => {
    const fetchPreview = vi.fn().mockResolvedValue({
      sections: [
        {
          id: 'tool-instructions',
          kind: 'tool_instructions',
          title: '工具提示词',
          summary: '2 个启用工具会向模型注入额外说明',
          sourceLabel: 'data/tools/*.md',
          order: 1,
          content: '## 联网搜索',
          meta: {
            tools: [
              { id: 'web_search', label: '联网搜索', content: 'Use web_search for fresh information.' },
            ],
          },
        },
        {
          id: 'history-a1',
          kind: 'history_turn',
          title: 'Teacher #2',
          summary: '我先帮你搜一下。',
          sourceLabel: 'data/{sessionId}/messages.json',
          order: 2,
          content: '我先帮你搜一下。',
          meta: {
            role: 'assistant',
            createdAt: '2026-03-28T10:00:00.000Z',
            parts: [
              { id: 'p1', kind: 'text', title: '过程 1: 文本', content: '我先帮你搜一下。' },
              {
                id: 'p2',
                kind: 'tool-call',
                title: '过程 2: 工具调用',
                toolName: 'web_search',
                content: '{\n  "query": "OpenClaw 是什么"\n}',
              },
              {
                id: 'p3',
                kind: 'tool-result',
                title: '过程 3: 工具结果',
                toolName: 'web_search',
                content: '{\n  "success": true\n}',
              },
            ],
          },
        },
      ],
    });

    render(
      <ContextPreviewModal
        open
        onClose={() => {}}
        title="模型记忆"
        description="当前 Session 的模型上下文"
        fetchPreview={fetchPreview}
      />,
    );

    expect(await screen.findByText('工具提示词')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /工具提示词/i }));
    await waitFor(() => {
      expect(screen.getByText('联网搜索')).toBeTruthy();
      expect(screen.getByText('Use web_search for fresh information.')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Teacher #2/i }));
    await waitFor(() => {
      expect(screen.getByText('过程 2: 工具调用')).toBeTruthy();
      expect(screen.getAllByText('web_search').length).toBeGreaterThan(0);
      expect(screen.getByText(/OpenClaw 是什么/)).toBeTruthy();
    });
  });
});
