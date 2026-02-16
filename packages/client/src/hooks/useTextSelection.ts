import { useState, useCallback } from 'react';

export interface TextSelection {
  text: string;
  fileName: string;
  startLine: number;
  endLine: number;
}

export function useTextSelection() {
  const [selection, setSelection] = useState<TextSelection | null>(null);

  /** Try to map the current DOM selection to a file range. Returns the result synchronously. */
  const handleSelection = useCallback((fileName: string, content: string): TextSelection | null => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      return null;
    }

    const selectedText = sel.toString().trim();
    const selStart = content.indexOf(selectedText);
    if (selStart === -1) return null;

    const beforeSel = content.slice(0, selStart);
    const startLine = beforeSel.split('\n').length;
    const endLine = startLine + selectedText.split('\n').length - 1;

    const result: TextSelection = { text: selectedText, fileName, startLine, endLine };
    setSelection(result);
    return result;
  }, []);

  const clearSelection = useCallback(() => setSelection(null), []);

  const getReference = useCallback((): string => {
    if (!selection) return '';
    return `[${selection.fileName}:${selection.startLine}:${selection.endLine}]`;
  }, [selection]);

  return { selection, handleSelection, clearSelection, getReference };
}
