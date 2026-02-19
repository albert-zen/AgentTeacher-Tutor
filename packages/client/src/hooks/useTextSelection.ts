import { useCallback } from 'react';

export interface TextSelection {
  text: string;
  fileName: string;
  startLine: number;
  endLine: number;
}

export function getSourceLineFromNode(node: Node): { start: number; end: number } | null {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
  while (el) {
    const attr = el.getAttribute('data-source-line');
    if (attr) {
      const [s, e] = attr.split('-').map(Number);
      if (!isNaN(s) && !isNaN(e)) return { start: s, end: e };
    }
    el = el.parentElement;
  }
  return null;
}

export function useTextSelection() {
  const handleSelection = useCallback((fileName: string, _content: string): TextSelection | null => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;

    const selectedText = sel.toString().trim();
    const anchorLine = sel.anchorNode ? getSourceLineFromNode(sel.anchorNode) : null;
    const focusLine = sel.focusNode ? getSourceLineFromNode(sel.focusNode) : null;

    if (!anchorLine && !focusLine) return null;

    const startLine = Math.min(anchorLine?.start ?? Infinity, focusLine?.start ?? Infinity);
    const endLine = Math.max(anchorLine?.end ?? 0, focusLine?.end ?? 0);

    return { text: selectedText, fileName, startLine, endLine };
  }, []);

  return { handleSelection };
}
