import { Node, mergeAttributes } from '@tiptap/core';
import type { NodeViewProps } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';

function ReferenceChipView({ node, deleteNode }: NodeViewProps) {
  const { file, startLine, endLine } = node.attrs as {
    file: string;
    startLine: number;
    endLine: number;
    preview: string;
  };
  const preview = (node.attrs as { preview: string }).preview;
  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/20 border border-blue-700/50 rounded text-blue-300 text-xs align-baseline mx-0.5 whitespace-nowrap"
        title={preview || undefined}
      >
        <span>
          {file} ({startLine}-{endLine})
        </span>
        <button
          onClick={deleteNode}
          className="ml-0.5 text-blue-400/60 hover:text-blue-200 leading-none"
          contentEditable={false}
        >
          &times;
        </button>
      </span>
    </NodeViewWrapper>
  );
}

export const ReferenceChip = Node.create({
  name: 'referenceChip',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      file: { default: '' },
      startLine: { default: 0 },
      endLine: { default: 0 },
      preview: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-reference-chip]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-reference-chip': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReferenceChipView);
  },
});
