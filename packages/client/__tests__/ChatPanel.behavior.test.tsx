// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent } from '@testing-library/react';
import ChatPanel from '../src/components/ChatPanel';
import type { ChatPanelHandle } from '../src/components/ChatPanel';
import type { CopySource, MessagePart } from '../src/api/client';

vi.mock('@tiptap/react', () => ({
  useEditor: () => ({
    state: {
      doc: {
        forEach: () => {},
      },
    },
    commands: {
      clearContent: vi.fn(),
      focus: vi.fn(),
      insertContent: vi.fn(),
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

vi.mock('../src/components/MarkdownRenderer', () => ({
  default: ({ children }: { children: string }) => <>{children}</>,
}));

function renderPanel(streamingParts: MessagePart[] = []) {
  const copySource = createRef<CopySource | null>();
  copySource.current = null;
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
  it('renders messages in single-column left alignment and without max-w limit', () => {
    const { container } = renderPanel();
    expect(container.querySelector('.justify-end')).toBeNull();
    expect(container.querySelector('.max-w-\\[85\\%\\]')).toBeNull();
  });

  it('pauses auto-scroll on wheel and resumes when scrolled back to bottom', () => {
    const { container, rerender } = renderPanel([{ type: 'text', content: 'start' }]);
    const scroller = container.querySelector('.overflow-y-auto') as HTMLDivElement;
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

    scrollTop = 900;
    fireEvent.wheel(scroller);
    const copySource = createRef<CopySource | null>();
    copySource.current = null;
    rerender(
      <ChatPanel
        ref={createRef<ChatPanelHandle>()}
        messages={[
          { id: 'u1', role: 'user', content: 'user content' },
          { id: 'a1', role: 'assistant', content: 'assistant content' },
        ]}
        streaming={true}
        streamingParts={[{ type: 'text', content: 'near-bottom' }]}
        copySource={copySource}
        onSend={() => {}}
      />,
    );
    expect(scrollTop).toBe(1000);

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
});
