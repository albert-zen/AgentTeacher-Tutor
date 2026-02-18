// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSession } from '../src/hooks/useSession';

vi.mock('../src/api/client', () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  getSessions: vi.fn(),
  getFiles: vi.fn(),
  streamChat: vi.fn(),
}));

import * as api from '../src/api/client';

const mockCreateSession = vi.mocked(api.createSession);
const mockGetSession = vi.mocked(api.getSession);
const mockGetFiles = vi.mocked(api.getFiles);
const mockStreamChat = vi.mocked(api.streamChat);

const SESSION: api.Session = { id: 's1', concept: 'test', createdAt: '2025-01-01' };

function setupStreamMock(events: api.SSEEvent[]) {
  const controller = new AbortController();
  mockStreamChat.mockImplementation((_sid, _msg, _refs, onEvent) => {
    setTimeout(() => {
      events.forEach((e) => onEvent?.(e));
    }, 0);
    return controller;
  });
  return controller;
}

async function flushEvents() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

describe('useSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSession.mockResolvedValue(SESSION);
    mockGetSession.mockResolvedValue({ session: SESSION, messages: [] });
    mockGetFiles.mockResolvedValue([]);
  });

  // --------------- Invariants ---------------

  it('U1: exposes correct shape', () => {
    const { result } = renderHook(() => useSession());
    const keys = Object.keys(result.current);
    for (const k of [
      'session',
      'messages',
      'files',
      'streaming',
      'streamingParts',
      'startSession',
      'loadSession',
      'clearSession',
      'stopStreaming',
      'send',
      'refreshFiles',
      'writingFile',
    ]) {
      expect(keys).toContain(k);
    }
  });

  it('U2: refreshFiles filters out messages.json', async () => {
    mockGetFiles.mockResolvedValue(['messages.json', 'guidance.md', 'notes.md']);

    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });

    expect(result.current.files).toEqual(['guidance.md', 'notes.md']);
  });

  // --------------- Create session ---------------

  it('E1: startSession creates session and sends first message with concept', async () => {
    mockStreamChat.mockReturnValue(new AbortController());

    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.startSession('React hooks');
    });

    expect(mockCreateSession).toHaveBeenCalledWith('React hooks');
    expect(result.current.session).toEqual(SESSION);
    expect(mockStreamChat).toHaveBeenCalledWith('s1', 'React hooks', [], expect.any(Function));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('user');
    expect(result.current.messages[0].content).toBe('React hooks');
  });

  it('E2: startSession clears existing messages and files', async () => {
    const oldMsg: api.ChatMessage = {
      id: 'm1',
      sessionId: 's1',
      role: 'user',
      content: 'old',
      createdAt: '',
    };
    mockGetSession.mockResolvedValue({ session: SESSION, messages: [oldMsg] });
    mockGetFiles.mockResolvedValue(['old-file.md']);

    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.files).toEqual(['old-file.md']);

    const newSess: api.Session = { id: 's2', concept: 'new', createdAt: '' };
    mockCreateSession.mockResolvedValue(newSess);
    mockStreamChat.mockReturnValue(new AbortController());

    await act(async () => {
      await result.current.startSession('new concept');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('new concept');
    expect(result.current.messages[0].sessionId).toBe('s2');
    expect(result.current.files).toEqual([]);
  });

  // --------------- Load session ---------------

  it('E3: loadSession fetches session data and refreshes files', async () => {
    const msgs: api.ChatMessage[] = [
      { id: '1', sessionId: 's1', role: 'user', content: 'hello', createdAt: '' },
      { id: '2', sessionId: 's1', role: 'assistant', content: 'hi', createdAt: '' },
    ];
    mockGetSession.mockResolvedValue({ session: SESSION, messages: msgs });
    mockGetFiles.mockResolvedValue(['guidance.md']);

    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });

    expect(mockGetSession).toHaveBeenCalledWith('s1');
    expect(mockGetFiles).toHaveBeenCalledWith('s1');
    expect(result.current.session).toEqual(SESSION);
    expect(result.current.messages).toEqual(msgs);
    expect(result.current.files).toEqual(['guidance.md']);
  });

  // --------------- Send message ---------------

  it('E4: send sets streaming=true, adds optimistic user message, opens SSE', async () => {
    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });

    mockStreamChat.mockReturnValue(new AbortController());

    act(() => {
      result.current.send('hello teacher');
    });

    expect(result.current.streaming).toBe(true);
    expect(mockStreamChat).toHaveBeenCalledWith('s1', 'hello teacher', [], expect.any(Function));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('user');
    expect(result.current.messages[0].content).toBe('hello teacher');
  });

  // --------------- SSE event handling ---------------

  it('E5: text-delta accumulates and merges consecutive text parts', async () => {
    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });

    setupStreamMock([
      { type: 'text-delta', content: 'Hello' },
      { type: 'text-delta', content: ' world' },
      { type: 'text-delta', content: '!' },
    ]);

    act(() => {
      result.current.send('hi');
    });
    await flushEvents();

    expect(result.current.streamingParts).toHaveLength(1);
    expect(result.current.streamingParts[0]).toEqual({
      type: 'text',
      content: 'Hello world!',
    });
  });

  it('E6: tool-call breaks text merge and adds tool-call part', async () => {
    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });

    setupStreamMock([
      { type: 'text-delta', content: 'Let me ' },
      { type: 'text-delta', content: 'help' },
      { type: 'tool-call', toolName: 'write_file', args: { path: 'test.md' } },
      { type: 'text-delta', content: 'Done' },
    ]);

    act(() => {
      result.current.send('write something');
    });
    await flushEvents();

    expect(result.current.streamingParts).toHaveLength(3);
    expect(result.current.streamingParts[0]).toEqual({
      type: 'text',
      content: 'Let me help',
    });
    expect(result.current.streamingParts[1]).toEqual({
      type: 'tool-call',
      toolName: 'write_file',
      args: { path: 'test.md' },
    });
    expect(result.current.streamingParts[2]).toEqual({ type: 'text', content: 'Done' });
  });

  it('E7: tool-result adds part and triggers file refresh', async () => {
    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });

    mockGetFiles.mockClear();
    mockGetFiles.mockResolvedValue(['guidance.md']);

    setupStreamMock([{ type: 'tool-result', toolName: 'write_file', result: 'ok' }]);

    act(() => {
      result.current.send('write something');
    });
    await flushEvents();

    expect(result.current.streamingParts).toHaveLength(1);
    expect(result.current.streamingParts[0]).toEqual({
      type: 'tool-result',
      toolName: 'write_file',
      result: 'ok',
    });
    expect(mockGetFiles).toHaveBeenCalledWith('s1');
  });

  it('E8: done constructs assistant message, appends to messages, clears streaming', async () => {
    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });

    setupStreamMock([{ type: 'text-delta', content: 'Hello there' }, { type: 'done' }]);

    act(() => {
      result.current.send('hi');
    });
    await flushEvents();

    expect(result.current.streaming).toBe(false);
    expect(result.current.streamingParts).toEqual([]);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].role).toBe('assistant');
    expect(result.current.messages[1].content).toBe('Hello there');
  });

  it('E9: done refreshes file list', async () => {
    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });

    mockGetFiles.mockClear();
    mockGetFiles.mockResolvedValue(['new-file.md']);

    setupStreamMock([{ type: 'text-delta', content: 'created' }, { type: 'done' }]);

    act(() => {
      result.current.send('create a file');
    });
    await flushEvents();

    expect(mockGetFiles).toHaveBeenCalledWith('s1');
    expect(result.current.files).toEqual(['new-file.md']);
  });

  // --------------- Stop and clear ---------------

  it('E10: stopStreaming aborts connection and sets streaming=false', async () => {
    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });

    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    mockStreamChat.mockReturnValue(controller);

    act(() => {
      result.current.send('hello');
    });
    expect(result.current.streaming).toBe(true);

    act(() => {
      result.current.stopStreaming();
    });

    expect(abortSpy).toHaveBeenCalled();
    expect(result.current.streaming).toBe(false);
  });

  it('E11: clearSession aborts and resets all state', async () => {
    mockGetSession.mockResolvedValue({
      session: SESSION,
      messages: [{ id: '1', sessionId: 's1', role: 'user' as const, content: 'hi', createdAt: '' }],
    });
    mockGetFiles.mockResolvedValue(['guidance.md']);

    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });

    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    mockStreamChat.mockReturnValue(controller);

    act(() => {
      result.current.send('hello');
    });
    expect(result.current.streaming).toBe(true);

    act(() => {
      result.current.clearSession();
    });

    expect(abortSpy).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.files).toEqual([]);
    expect(result.current.streaming).toBe(false);
    expect(result.current.streamingParts).toEqual([]);
    expect(result.current.writingFile).toBeNull();
  });

  // --------------- Guards ---------------

  it('X1: send no-ops when session is null', () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.send('hello');
    });

    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it('X2: error event sets streaming=false without corrupting messages', async () => {
    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });

    setupStreamMock([
      { type: 'text-delta', content: 'partial' },
      { type: 'error', error: 'something went wrong' },
    ]);

    act(() => {
      result.current.send('hello');
    });
    await flushEvents();

    expect(result.current.streaming).toBe(false);
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.failedMessage).toBeTruthy();
  });

  it('X3: done with empty text and no parts skips assistant message', async () => {
    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.loadSession('s1');
    });

    setupStreamMock([{ type: 'done' }]);

    act(() => {
      result.current.send('hello');
    });
    await flushEvents();

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('user');
    expect(result.current.streaming).toBe(false);
  });
});
