import { useEffect, useState, useCallback } from 'react';

interface Props {
  onAsk: (selectedText: string) => void;
}

export default function SelectionPopup({ onAsk }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState('');

  const handleMouseUp = useCallback((event: MouseEvent) => {
    const mousePos = { x: event.clientX, y: event.clientY };

    // Small delay to let the selection finalize
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setPos(null);
        setText('');
        return;
      }

      const selectedText = sel.toString().trim();

      setPos({
        x: mousePos.x,
        y: mousePos.y - 8,
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
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-400/25 bg-blue-600/75 px-3 py-1.5 text-xs text-zinc-100 shadow-lg shadow-black/35 transition-colors hover:bg-blue-500/75"
      >
        <span>💬</span> Ask Teacher
      </button>
    </div>
  );
}
