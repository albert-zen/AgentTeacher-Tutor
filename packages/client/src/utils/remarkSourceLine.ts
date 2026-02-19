import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'code',
  'list',
  'listItem',
  'table',
  'tableRow',
  'thematicBreak',
]);

const remarkSourceLine: Plugin = () => (tree) => {
  visit(tree, (node) => {
    if (!node.position || !BLOCK_TYPES.has(node.type)) return;
    const { start, end: endPos } = node.position;
    const data = (node.data ?? {}) as Record<string, unknown>;
    const existing = (data.hProperties as Record<string, unknown>) ?? {};
    data.hProperties = {
      ...existing,
      'data-source-line': `${start.line}-${endPos.line}`,
    };
    node.data = data;
  });
};

export default remarkSourceLine;
