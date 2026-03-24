// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react';
import type { CopySource, MessagePart } from '../src/api/client';

const { virtualizerMeasureMock, virtualizerOptionsMock } = vi.hoisted(() => ({
  virtualizerMeasureMock: vi.fn(),
  virtualizerOptionsMock: vi.fn(),
}));

let serializedText = '';
const editorListeners = new Map<string, Set<() => void>>();
const mockEditor = {
  commands: {
    clearContent: vi.fn(),
    focus: vi.fn(),
    insertContent: vi.fn(),
  },
  on: vi.fn((event: string, listener: () => void) => {
    const listeners = editorListeners.get(event) ?? new Set<() => void>();
    listeners.add(listener);
    editorListeners.set(event, listeners);
  }),
  off: vi.fn((event: string, listener: () => void) => {
    editorListeners.get(event)?.delete(listener);
  }),
};

function emitEditorEvent(event: string) {
  for (const listener of editorListeners.get(event) ?? []) {
    listener();
  }
}

vi.mock('@tiptap/react', () => ({
  useEditor: () => mockEditor,
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

vi.mock('../src/components/MarkdownRenderer', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown-renderer">{children}</div>,
}));

vi.mock('../src/utils/serializeEditor', () => ({
  REF_PATTERN: '\\[([^:\\]]+)(?::(\\d+))?(?::(\\d+))?\\]',
  serializeEditorContent: () => serializedText,
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; getItemKey?: (index: number) => string }) => {
    virtualizerOptionsMock(options);
    return {
      getTotalSize: () => options.count * 120,
      getVirtualItems: () =>
        Array.from({ length: options.count }, (_, index) => ({
          index,
          key: index,
          start: index * 120,
        })),
      measureElement: vi.fn(),
      measure: virtualizerMeasureMock,
    };
  },
}));

import ChatPanel from '../src/components/ChatPanel';
import type { ChatPanelHandle } from '../src/components/ChatPanel';

const copySource = createRef<CopySource | null>();
copySource.current = null;

const stableTwoTurnMessages = [
  { id: 'u1', role: 'user' as const, content: 'user content' },
  { id: 'a1', role: 'assistant' as const, content: 'assistant content' },
];

function createMessages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `message-${index}`,
  }));
}

function renderPanel(streamingParts: MessagePart[] = []) {
  return render(
    <ChatPanel
      ref={createRef<ChatPanelHandle>()}
      messages={stableTwoTurnMessages}
      streaming={true}
      streamingParts={streamingParts}
      copySource={copySource}
      onSend={() => {}}
    />,
  );
}

describe('ChatPanel behavior', () => {
  beforeEach(() => {
    serializedText = '';
    editorListeners.clear();
    vi.clearAllMocks();
    virtualizerMeasureMock.mockClear();
    virtualizerOptionsMock.mockClear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pauses auto-scroll on wheel and resumes when scrolled back to bottom', () => {
    const { container, rerender } = renderPanel([{ type: 'text', content: 'start' }]);
    const scroller = container.querySelector('.flex-1.overflow-y-auto') as HTMLDivElement;
    expect(scroller).toBeTruthy();

    let scrollTop = 900;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });

    scrollTop = 400;
    fireEvent.wheel(scroller);
    rerender(
      <ChatPanel
        ref={createRef<ChatPanelHandle>()}
        messages={stableTwoTurnMessages}
        streaming={true}
        streamingParts={[{ type: 'text', content: 'next' }]}
        copySource={copySource}
        onSend={() => {}}
      />,
    );
    expect(scrollTop).toBe(400);

    scrollTop = 920;
    fireEvent.scroll(scroller);
    rerender(
      <ChatPanel
        ref={createRef<ChatPanelHandle>()}
        messages={stableTwoTurnMessages}
        streaming={true}
        streamingParts={[{ type: 'text', content: 'final' }]}
        copySource={copySource}
        onSend={() => {}}
      />,
    );
    expect(scrollTop).toBe(1000);
  });

  it('updates send button disabled state when the editor content changes', async () => {
    render(
      <ChatPanel
        ref={createRef<ChatPanelHandle>()}
        messages={[]}
        streaming={false}
        streamingParts={[]}
        copySource={copySource}
        onSend={() => {}}
      />,
    );

    const sendButton = screen.getByRole('button', { name: '发送' }) as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);

    serializedText = 'hello';
    await act(async () => {
      emitEditorEvent('update');
    });

    expect(sendButton.disabled).toBe(false);
  });

  it('does not re-run full virtualizer measure on each streamingParts-only update', () => {
    const { rerender } = renderPanel([{ type: 'text', content: 'a' }]);
    virtualizerMeasureMock.mockClear();

    for (let i = 0; i < 12; i++) {
      rerender(
        <ChatPanel
          ref={createRef<ChatPanelHandle>()}
          messages={stableTwoTurnMessages}
          streaming={true}
          streamingParts={[{ type: 'text', content: `chunk-${i}` }]}
          copySource={copySource}
          onSend={() => {}}
        />,
      );
    }

    expect(virtualizerMeasureMock).not.toHaveBeenCalled();
  });

  it('renders short conversations outside the virtualized region and keeps history keys stable', () => {
    const { container } = renderPanel([{ type: 'text', content: 'streaming' }]);

    expect(container.querySelectorAll('[data-index]')).toHaveLength(0);

    const latestOptions = virtualizerOptionsMock.mock.lastCall?.[0] as
      | { count: number; getItemKey?: (index: number) => string }
      | undefined;
    expect(latestOptions?.count).toBe(0);
  });

  it('moves older tail items into the virtualized region when new messages are appended', () => {
    const messages = createMessages(10);
    const { container, rerender } = render(
      <ChatPanel
        ref={createRef<ChatPanelHandle>()}
        messages={messages}
        streaming={false}
        streamingParts={[]}
        copySource={copySource}
        onSend={() => {}}
      />,
    );

    expect(container.querySelectorAll('[data-index]')).toHaveLength(2);
    expect((virtualizerOptionsMock.mock.lastCall?.[0] as { count: number } | undefined)?.count).toBe(2);

    rerender(
      <ChatPanel
        ref={createRef<ChatPanelHandle>()}
        messages={[...messages, { id: 'm10', role: 'assistant', content: 'message-10' }]}
        streaming={false}
        streamingParts={[]}
        copySource={copySource}
        onSend={() => {}}
      />,
    );

    expect(container.querySelectorAll('[data-index]')).toHaveLength(3);
    expect((virtualizerOptionsMock.mock.lastCall?.[0] as { count: number } | undefined)?.count).toBe(3);
    expect(screen.getByText('message-10')).toBeTruthy();
  });

  it('keeps bottom follow when a new message pushes the hybrid boundary', () => {
    const messages = createMessages(10);
    const { container, rerender } = render(
      <ChatPanel
        ref={createRef<ChatPanelHandle>()}
        messages={messages}
        streaming={false}
        streamingParts={[]}
        copySource={copySource}
        onSend={() => {}}
      />,
    );

    const scroller = container.querySelector('.flex-1.overflow-y-auto') as HTMLDivElement;
    let scrollTop = 900;
    let scrollHeight = 1000;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    });

    fireEvent.scroll(scroller);
    scrollHeight = 1120;

    rerender(
      <ChatPanel
        ref={createRef<ChatPanelHandle>()}
        messages={[...messages, { id: 'm10', role: 'user', content: 'newest tail message' }]}
        streaming={false}
        streamingParts={[]}
        copySource={copySource}
        onSend={() => {}}
      />,
    );

    expect(scrollTop).toBe(1120);
    expect(screen.getByText('newest tail message')).toBeTruthy();
  });

  it('renders streaming text without the markdown renderer pipeline', () => {
    const { container } = renderPanel([{ type: 'text', content: 'streaming line 1\nstreaming line 2' }]);

    const streamingBubble = container.querySelector('[data-streaming-bubble]');
    expect(streamingBubble).toBeTruthy();
    expect(streamingBubble?.querySelectorAll('[data-testid="markdown-renderer"]')).toHaveLength(0);
    expect(streamingBubble?.textContent).toContain('streaming line 1');
  });

  it('keeps scroll stable when streaming ends and the streaming row becomes an assistant message', () => {
    const { container, rerender } = renderPanel([{ type: 'text', content: 'streaming' }]);
    const scroller = container.querySelector('.flex-1.overflow-y-auto') as HTMLDivElement;
    let scrollTop = 0;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 800 });

    scrollTop = 100;
    fireEvent.scroll(scroller);

    rerender(
      <ChatPanel
        ref={createRef<ChatPanelHandle>()}
        messages={[
          ...stableTwoTurnMessages,
          {
            id: 'a2',
            role: 'assistant',
            content: 'final',
            parts: [{ type: 'text', content: 'final' }],
          },
        ]}
        streaming={false}
        streamingParts={[]}
        copySource={copySource}
        onSend={() => {}}
      />,
    );

    expect(scrollTop).toBe(100);
  });
});
