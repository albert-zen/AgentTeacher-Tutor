// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamChat, type SSEEvent } from '../src/api/client';

function createMockResponse(chunks: string[]): Response {
  let idx = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(new TextEncoder().encode(chunks[idx++]));
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streamChat SSE parsing', () => {
  // E1
  it('returns an AbortController', () => {
    vi.mocked(fetch).mockResolvedValue(createMockResponse([]));
    const ctrl = streamChat('s1', 'hello');
    expect(ctrl).toBeInstanceOf(AbortController);
  });

  // E2
  it('parses data: lines and calls onEvent', async () => {
    const events: SSEEvent[] = [];
    vi.mocked(fetch).mockResolvedValue(createMockResponse(['data: {"type":"text-delta","content":"hi"}\n\n']));
    streamChat('s1', 'hello', undefined, (e) => events.push(e));
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toEqual({ type: 'text-delta', content: 'hi' });
  });

  // E3
  it('buffers partial chunks across reads', async () => {
    const events: SSEEvent[] = [];
    vi.mocked(fetch).mockResolvedValue(createMockResponse(['data: {"type":"text-', 'delta","content":"hi"}\n\n']));
    streamChat('s1', 'hello', undefined, (e) => events.push(e));
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toEqual({ type: 'text-delta', content: 'hi' });
  });

  // E4
  it('parses multiple data lines in a single chunk', async () => {
    const events: SSEEvent[] = [];
    vi.mocked(fetch).mockResolvedValue(
      createMockResponse(['data: {"type":"text-delta","content":"a"}\ndata: {"type":"text-delta","content":"b"}\n\n']),
    );
    streamChat('s1', 'hello', undefined, (e) => events.push(e));
    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[0]).toEqual({ type: 'text-delta', content: 'a' });
    expect(events[1]).toEqual({ type: 'text-delta', content: 'b' });
  });

  // X1
  it('skips invalid JSON in data lines', async () => {
    const events: SSEEvent[] = [];
    vi.mocked(fetch).mockResolvedValue(createMockResponse(['data: NOT JSON\ndata: {"type":"done"}\n\n']));
    streamChat('s1', 'hello', undefined, (e) => events.push(e));
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toEqual({ type: 'done' });
  });

  // X2
  it('abort does not throw', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const ctrl = streamChat('s1', 'hello');
    expect(() => ctrl.abort()).not.toThrow();
  });

  // X3: non-ok response emits error event
  it('emits error event when response is not ok', async () => {
    const events: SSEEvent[] = [];
    vi.mocked(fetch).mockResolvedValue(
      new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
    );
    streamChat('s1', 'hello', undefined, (e) => events.push(e));
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toEqual({ type: 'error', error: 'API error 500: Internal Server Error' });
  });
});
