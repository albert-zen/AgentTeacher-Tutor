// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import SelectionPopup from '../src/components/SelectionPopup';

function createRect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('SelectionPopup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
  });

  it('anchors to the last client rect instead of the whole selection bounding box', () => {
    const onAsk = vi.fn();
    const boundingRect = createRect({ left: 80, top: 100, width: 420, height: 60 });
    const firstLineRect = createRect({ left: 90, top: 100, width: 110, height: 20 });
    const lastLineRect = createRect({ left: 360, top: 128, width: 70, height: 20 });

    const selection = {
      isCollapsed: false,
      toString: () => 'foo\nbar',
      getRangeAt: () =>
        ({
          getBoundingClientRect: () => boundingRect,
          getClientRects: () => [firstLineRect, lastLineRect],
        }) as unknown as Range,
      removeAllRanges: vi.fn(),
    } as unknown as Selection;

    vi.spyOn(window, 'getSelection').mockReturnValue(selection);

    render(<SelectionPopup onAsk={onAsk} />);

    act(() => {
      fireEvent.mouseUp(document);
      vi.advanceTimersByTime(20);
    });

    const button = screen.getByRole('button', { name: /ask teacher/i });
    const popup = button.parentElement as HTMLElement;

    expect(popup.style.left).toBe('395px');
    expect(popup.style.top).toBe('120px');
  });
});
