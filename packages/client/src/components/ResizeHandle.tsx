import { useCallback, useRef } from 'react';

interface ResizeHandleProps {
  onResize: (deltaX: number) => void;
  direction?: 'horizontal' | 'vertical';
}

export default function ResizeHandle({ onResize, direction = 'horizontal' }: ResizeHandleProps) {
  const lastPosRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const isHorizontal = direction === 'horizontal';
      lastPosRef.current = isHorizontal ? e.clientX : e.clientY;

      const overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:9999;pointer-events:auto;user-select:none;cursor:' +
        (isHorizontal ? 'col-resize' : 'row-resize');
      document.body.appendChild(overlay);

      const onMouseMove = (ev: MouseEvent) => {
        const current = isHorizontal ? ev.clientX : ev.clientY;
        const delta = current - lastPosRef.current;
        lastPosRef.current = current;
        onResize(delta);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        overlay.remove();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [direction, onResize],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className={
        (direction === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize') +
        ' bg-zinc-800 hover:bg-zinc-600 transition-colors flex-shrink-0'
      }
    />
  );
}
