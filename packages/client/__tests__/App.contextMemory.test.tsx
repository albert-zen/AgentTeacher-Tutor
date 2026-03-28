// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('../src/components/FileTree', () => ({
  default: () => <div data-testid="file-tree" />,
}));

vi.mock('../src/components/MarkdownEditor', () => ({
  default: () => <div data-testid="markdown-editor" />,
}));

vi.mock('../src/components/ChatPanel', () => ({
  default: () => <div data-testid="chat-panel" />,
}));

vi.mock('../src/components/MilestoneBar', () => ({
  default: () => null,
}));

vi.mock('../src/components/ResizeHandle', () => ({
  default: () => null,
}));

vi.mock('../src/components/SelectionPopup', () => ({
  default: () => null,
}));

vi.mock('../src/components/SessionPromptModal', () => ({
  default: () => null,
}));

vi.mock('../src/components/SessionToolsModal', () => ({
  default: () => null,
}));

vi.mock('../src/hooks/useTextSelection', () => ({
  useTextSelection: () => ({ handleSelection: () => null }),
  getSourceLineFromNode: () => null,
}));

vi.mock('../src/hooks/useSession', () => ({
  useSession: () => ({
    session: { id: 'session-1', concept: 'OpenClaw' },
    messages: [],
    files: ['guidance.md'],
    streaming: false,
    streamingParts: [],
    startSession: vi.fn(),
    loadSession: vi.fn(),
    clearSession: vi.fn(),
    stopStreaming: vi.fn(),
    send: vi.fn(),
    refreshFiles: vi.fn(),
    writingFile: null,
    failedMessage: null,
    retrySend: vi.fn(),
    hasMoreHistory: false,
    loadingOlder: false,
    historyError: null,
    loadOlderMessages: vi.fn(),
  }),
}));

const mockReadFile = vi.fn();
const mockGetSessionContextMemory = vi.fn();

vi.mock('../src/api/client', async () => {
  const actual = await vi.importActual<object>('../src/api/client');
  return {
    ...actual,
    getSessions: vi.fn().mockResolvedValue([]),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    getSessionContextMemory: (...args: unknown[]) => mockGetSessionContextMemory(...args),
  };
});

import App from '../src/App';

describe('App context memory entry', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue({ content: '# guidance', totalLines: 1 });
    mockGetSessionContextMemory.mockResolvedValue({
      sections: [
        {
          id: 'history-a1',
          kind: 'history_turn',
          title: 'Teacher #1',
          summary: '我先帮你搜一下。',
          order: 1,
          content: '我先帮你搜一下。',
          meta: {
            role: 'assistant',
            createdAt: '2026-03-28T10:00:00.000Z',
            parts: [{ id: 'p1', kind: 'text', title: '过程 1: 文本', content: '我先帮你搜一下。' }],
          },
        },
      ],
    });
  });

  it('opens session memory modal from the workspace header', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '模型记忆' }));

    await waitFor(() => {
      expect(screen.getByText('Teacher #1')).toBeTruthy();
      expect(mockGetSessionContextMemory).toHaveBeenCalledWith('session-1');
    });
  });
});
