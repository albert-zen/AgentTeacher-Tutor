import { useEffect, useState, useCallback } from 'react';

interface Props {
  onAsk: (selectedText: string) => void;
}

export default function SelectionPopup({ onAsk }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState('');

  const handleMouseUp = useCallback(() => {
    // Small delay to let the selection finalize
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setPos(null);
        setText('');
        return;
      }

      const selectedText = sel.toString().trim();
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setPos({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
      setText(selectedText);
    }, 10);
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    // Hide popup when clicking outside it
    const target = e.target as HTMLElement;
    if (!target.closest('[data-selection-popup]')) {
      setPos(null);
      setText('');
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [handleMouseUp, handleMouseDown]);

  if (!pos || !text) return null;

  return (
    <div
      data-selection-popup
      className="fixed z-50 flex gap-1 -translate-x-1/2 -translate-y-full"
      style={{ left: pos.x, top: pos.y }}
    >
      <button
        onClick={() => {
          onAsk(text);
          setPos(null);
          setText('');
          window.getSelection()?.removeAllRanges();
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg shadow-lg shadow-black/50 whitespace-nowrap"
      >
        <span>💬</span> Ask Teacher
      </button>
    </div>
  );
}
