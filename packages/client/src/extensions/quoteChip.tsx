import { Node, mergeAttributes } from '@tiptap/core';
import type { NodeViewProps } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';

function QuoteChipView({ node, deleteNode }: NodeViewProps) {
  const { text } = node.attrs as { text: string };
  const preview = text.length > 40 ? text.slice(0, 40) + '...' : text;
  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-zinc-500/20 border border-zinc-600/50 rounded text-zinc-300 text-xs align-baseline mx-0.5 max-w-[240px]"
        title={text}
      >
        <span className="truncate">&ldquo;{preview}&rdquo;</span>
        <button
          onClick={deleteNode}
          className="ml-0.5 flex-shrink-0 text-zinc-400/60 hover:text-zinc-200 leading-none"
          contentEditable={false}
        >
          &times;
        </button>
      </span>
    </NodeViewWrapper>
  );
}

export const QuoteChip = Node.create({
  name: 'quoteChip',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      text: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-quote-chip]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-quote-chip': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(QuoteChipView);
  },
});
