// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import App from '../src/App';

vi.mock('../src/components/FileTree', () => ({
  default: () => <div data-testid="file-tree" />,
}));

vi.mock('../src/components/MarkdownEditor', () => ({
  default: () => <div data-testid="markdown-editor" />,
}));

vi.mock('../src/components/ChatPanel', () => ({
  default: () => <div data-testid="chat-panel" />,
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

vi.mock('../src/hooks/useTextSelection', () => ({
  useTextSelection: () => ({ handleSelection: () => null }),
  getSourceLineFromNode: () => null,
}));

vi.mock('../src/components/landing/LandingPage', () => ({
  default: ({ onLoadSession }: { onLoadSession: (id: string) => Promise<void> }) => (
    <div>
      <div>landing</div>
      <button onClick={() => onLoadSession('s1')}>load-s1</button>
      <button onClick={() => onLoadSession('s2')}>load-s2</button>
    </div>
  ),
}));

vi.mock('../src/api/client', () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  getSessions: vi.fn(),
  getFiles: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  streamChat: vi.fn(),
}));

import * as api from '../src/api/client';

const mockGetSession = vi.mocked(api.getSession);
const mockGetSessions = vi.mocked(api.getSessions);
const mockGetFiles = vi.mocked(api.getFiles);
const mockReadFile = vi.mocked(api.readFile);
const mockStreamChat = vi.mocked(api.streamChat);

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('App milestones isolation', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamChat.mockReturnValue(new AbortController());
    mockGetSessions.mockResolvedValue([
      { id: 's1', concept: 'one', createdAt: '' },
      { id: 's2', concept: 'two', createdAt: '' },
    ]);
    mockGetFiles.mockImplementation(async (sessionId: string) => {
      if (sessionId === 's1') return ['guidance.md', 'milestones.md'];
      return ['guidance.md'];
    });
    mockReadFile.mockImplementation(async (sessionId: string, filePath: string) => {
      if (sessionId === 's1' && filePath === 'milestones.md') {
        return {
          content: '# 里程碑: Demo\n- [ ] Alpha',
          totalLines: 2,
        };
      }
      return {
        content: '# guidance',
        totalLines: 1,
      };
    });
  });

  it('clears old milestones immediately when switching to a session without milestones', async () => {
    const s2Deferred = createDeferred<{
      session: api.Session;
      messages: api.ChatMessage[];
    }>();

    mockGetSession.mockImplementation(async (id: string) => {
      if (id === 's1') {
        return {
          session: { id: 's1', concept: 'one', createdAt: '' },
          messages: [],
        };
      }
      return s2Deferred.promise;
    });

    render(<App />);

    fireEvent.click(screen.getByText('load-s1'));
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText('Sessions')[0]);
    await waitFor(() => {
      expect(screen.getByText('load-s2')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('load-s2'));
    expect(screen.queryByText('Alpha')).toBeNull();

    s2Deferred.resolve({
      session: { id: 's2', concept: 'two', createdAt: '' },
      messages: [],
    });

    await waitFor(() => {
      expect(screen.queryByText('Alpha')).toBeNull();
    });
  });

  it('clears milestones when leaving current session', async () => {
    mockGetSession.mockResolvedValue({
      session: { id: 's1', concept: 'one', createdAt: '' },
      messages: [],
    });

    render(<App />);

    fireEvent.click(screen.getByText('load-s1'));
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText('Sessions')[0]);

    await waitFor(() => {
      expect(screen.getByText('landing')).toBeTruthy();
      expect(screen.queryByText('Alpha')).toBeNull();
    });
  });
});
