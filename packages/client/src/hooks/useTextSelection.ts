import { useState, useCallback } from 'react';

export interface TextSelection {
  text: string;
  fileName: string;
  startLine: number;
  endLine: number;
}

export function useTextSelection() {
  const [selection, setSelection] = useState<TextSelection | null>(null);

  const handleSelection = useCallback((fileName: string, content: string) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      return;
    }

    const selectedText = sel.toString().trim();
    const lines = content.split('\n');
    const fullText = content;
    const selStart = fullText.indexOf(selectedText);
    if (selStart === -1) return;

    const beforeSel = fullText.slice(0, selStart);
    const startLine = beforeSel.split('\n').length;
    const endLine = startLine + selectedText.split('\n').length - 1;

    setSelection({
      text: selectedText,
      fileName,
      startLine,
      endLine,
    });
  }, []);

  const clearSelection = useCallback(() => setSelection(null), []);

  const getReference = useCallback((): string => {
    if (!selection) return '';
    return `[${selection.fileName}:${selection.startLine}:${selection.endLine}]`;
  }, [selection]);

  return { selection, handleSelection, clearSelection, getReference };
}
