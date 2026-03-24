// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react';
import type { CopySource, MessagePart } from '../src/api/client';

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
  default: ({ children }: { children: string }) => <>{children}</>,
}));

vi.mock('../src/utils/serializeEditor', () => ({
  REF_PATTERN: '\\[([^:\\]]+)(?::(\\d+))?(?::(\\d+))?\\]',
  serializeEditorContent: () => serializedText,
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

import ChatPanel from '../src/components/ChatPanel';
import type { ChatPanelHandle } from '../src/components/ChatPanel';

const copySource = createRef<CopySource | null>();
copySource.current = null;

function renderPanel(streamingParts: MessagePart[] = []) {
  return render(
    <ChatPanel
      ref={createRef<ChatPanelHandle>()}
      messages={[
        { id: 'u1', role: 'user', content: 'user content' },
        { id: 'a1', role: 'assistant', content: 'assistant content' },
      ]}
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
        messages={[
          { id: 'u1', role: 'user', content: 'user content' },
          { id: 'a1', role: 'assistant', content: 'assistant content' },
        ]}
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
        messages={[
          { id: 'u1', role: 'user', content: 'user content' },
          { id: 'a1', role: 'assistant', content: 'assistant content' },
        ]}
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
});
