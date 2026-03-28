// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import ChatPanel from '../src/components/ChatPanel';

vi.mock('@tiptap/react', () => ({
  useEditor: () => ({
    commands: {
      clearContent: vi.fn(),
      insertContent: vi.fn(),
      focus: vi.fn(),
    },
  }),
  EditorContent: () => <div data-testid="editor-content" />,
}));

vi.mock('@tiptap/starter-kit', () => ({
  default: {
    configure: () => ({}),
  },
}));

vi.mock('@tiptap/extension-placeholder', () => ({
  default: {
    configure: () => ({}),
  },
}));

vi.mock('../src/extensions/referenceChip', () => ({
  ReferenceChip: {},
}));

vi.mock('../src/extensions/quoteChip', () => ({
  QuoteChip: {},
}));

vi.mock('../src/utils/serializeEditor', () => ({
  REF_PATTERN: '\\[([^:\\]]+)(?::(\\d+))?(?::(\\d+))?\\]',
  serializeEditorContent: () => '',
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 120,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 120,
      })),
    measureElement: vi.fn(),
    measure: vi.fn(),
  }),
}));

const copySource = { current: null };

function createMessages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${index + 1}`,
    role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `message-${index + 1}`,
  }));
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('triggers older-history loading only once while a top-scroll request is pending', async () => {
    const pending = deferred();
    const onLoadOlder = vi.fn(() => pending.promise);
    const { container, rerender } = render(
      <div style={{ height: 600 }}>
        <ChatPanel
          messages={[
            { id: '1', role: 'user', content: 'first' },
            { id: '2', role: 'assistant', content: 'second' },
          ]}
          streaming={false}
          streamingParts={[]}
          copySource={copySource}
          onSend={vi.fn()}
          hasMoreHistory
          loadingOlder={false}
          onLoadOlder={onLoadOlder}
        />
      </div>,
    );

    const scroller = container.querySelector('.flex-1.overflow-y-auto') as HTMLDivElement;
    Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(scroller, 'scrollHeight', { value: 1200, configurable: true });

    fireEvent.scroll(scroller);
    fireEvent.scroll(scroller);

    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    rerender(
      <div style={{ height: 600 }}>
        <ChatPanel
          messages={[
            { id: '0', role: 'user', content: 'older' },
            { id: '1', role: 'user', content: 'first' },
            { id: '2', role: 'assistant', content: 'second' },
          ]}
          streaming={false}
          streamingParts={[]}
          copySource={copySource}
          onSend={vi.fn()}
          hasMoreHistory={false}
          loadingOlder={true}
          onLoadOlder={onLoadOlder}
        />
      </div>,
    );

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });

    expect(screen.getByText('older')).toBeTruthy();
  });

  it('renders pagination errors without throwing when load more fails', async () => {
    const onLoadOlder = vi.fn().mockRejectedValue(new Error('network down'));
    const { container } = render(
      <div style={{ height: 600 }}>
        <ChatPanel
          messages={[{ id: '1', role: 'assistant', content: 'hello' }]}
          streaming={false}
          streamingParts={[]}
          copySource={copySource}
          onSend={vi.fn()}
          hasMoreHistory
          historyError="network down"
          onLoadOlder={onLoadOlder}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: '加载更早消息' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('network down');
  });

  it('restores scroll anchor when prepending into a long virtualized history', async () => {
    const onLoadOlder = vi.fn().mockResolvedValue(undefined);
    const messages = createMessages(10);
    const { container, rerender } = render(
      <div style={{ height: 600 }}>
        <ChatPanel
          messages={messages}
          streaming={false}
          streamingParts={[]}
          copySource={copySource}
          onSend={vi.fn()}
          hasMoreHistory
          loadingOlder={false}
          onLoadOlder={onLoadOlder}
        />
      </div>,
    );

    const scroller = container.querySelector('.flex-1.overflow-y-auto') as HTMLDivElement;
    let scrollTop = 50;
    let scrollHeight = 1200;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    });

    fireEvent.scroll(scroller);
    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    scrollHeight = 1440;
    rerender(
      <div style={{ height: 600 }}>
        <ChatPanel
          messages={[
            { id: 'older-a', role: 'assistant', content: 'older-a' },
            { id: 'older-b', role: 'user', content: 'older-b' },
            ...messages,
          ]}
          streaming={false}
          streamingParts={[]}
          copySource={copySource}
          onSend={vi.fn()}
          hasMoreHistory={false}
          loadingOlder={false}
          onLoadOlder={onLoadOlder}
        />
      </div>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(scrollTop).toBe(290);
    expect(screen.getByText('older-a')).toBeTruthy();
  });

  it('renders friendly labels for web_search tool events', () => {
    render(
      <div style={{ height: 600 }}>
        <ChatPanel
          messages={[
            {
              id: '1',
              role: 'assistant',
              content: '',
              parts: [
                {
                  type: 'tool-call',
                  toolName: 'web_search',
                  args: { query: 'react compiler' },
                },
                {
                  type: 'tool-result',
                  toolName: 'web_search',
                  result: {
                    success: true,
                    data: { results: [{ title: 'React Compiler', url: 'https://react.dev/compiler' }] },
                  },
                },
              ],
            },
          ]}
          streaming={false}
          streamingParts={[]}
          copySource={copySource}
          onSend={vi.fn()}
        />
      </div>,
    );

    expect(screen.getByRole('button', { name: /searching web/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /found 1 results/i })).toBeTruthy();
  });

  it('renders friendly labels for fetch_url tool events', () => {
    render(
      <div style={{ height: 600 }}>
        <ChatPanel
          messages={[
            {
              id: '1',
              role: 'assistant',
              content: '',
              parts: [
                {
                  type: 'tool-call',
                  toolName: 'fetch_url',
                  args: { url: 'https://example.com/doc' },
                },
                {
                  type: 'tool-result',
                  toolName: 'fetch_url',
                  result: {
                    success: true,
                    data: { title: 'Example Doc', content: 'Alpha Beta' },
                  },
                },
              ],
            },
          ]}
          streaming={false}
          streamingParts={[]}
          copySource={copySource}
          onSend={vi.fn()}
        />
      </div>,
    );

    expect(screen.getByText('Fetching page...')).toBeTruthy();
    expect(screen.getByText('Fetched Example Doc')).toBeTruthy();
  });
});
