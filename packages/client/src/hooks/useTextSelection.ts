import { useCallback } from 'react';

export interface TextSelection {
  text: string;
  fileName: string;
  startLine: number;
  endLine: number;
}

export function useTextSelection() {
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

    return { text: selectedText, fileName, startLine, endLine };
  }, []);

  return { handleSelection };
}
