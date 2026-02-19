import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import request from 'supertest';
import { Store } from '../src/db/index.js';
import { createSessionRouter } from '../src/routes/session.js';
import { createChatRouter } from '../src/routes/chat.js';

vi.mock('../src/services/llm.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/llm.js')>();
  return {
    ...original,
    loadLLMConfig: vi.fn(() => ({
      provider: 'test',
      apiKey: 'test-key',
      baseURL: 'http://test',
      model: 'test-model',
    })),
    isLLMConfigured: vi.fn(() => true),
    createLLMClient: vi.fn(() => 'mock-model'),
    streamTeacherResponse: vi.fn(),
  };
});

import { streamTeacherResponse, isLLMConfigured, loadLLMConfig } from '../src/services/llm.js';

const mockStreamTeacher = vi.mocked(streamTeacherResponse);
const mockIsConfigured = vi.mocked(isLLMConfigured);
const mockLoadConfig = vi.mocked(loadLLMConfig);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockStream(parts: Array<{ type: string; [key: string]: unknown }>) {
  return {
    fullStream: (async function* () {
      for (const part of parts) yield part;
    })(),
  };
}

function parseSSE(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let tempDir: string;
let app: express.Express;
let store: Store;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-sse-'));
  store = new Store(tempDir);
  app = express();
  app.use(express.json());
  app.use('/api/session', createSessionRouter(store, tempDir));
  app.use('/api/session', createChatRouter(store, tempDir));

  vi.clearAllMocks();
  mockIsConfigured.mockReturnValue(true);
  mockLoadConfig.mockReturnValue({
    provider: 'test',
    apiKey: 'test-key',
    baseURL: 'http://test',
    model: 'test-model',
  });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/** Create a session and return its id. */
async function createSession(concept = 'test') {
  const res = await request(app).post('/api/session').send({ concept });
  return res.body as { id: string; concept: string; createdAt: string };
}

// ===========================================================================
// Request validation
// ===========================================================================

describe('Request validation', () => {
  // X1
  it('returns 404 (not SSE) when session does not exist', async () => {
    const res = await request(app).post('/api/session/nonexistent-id/chat').send({ message: 'hi' });

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.error).toBeDefined();
  });

  // X2
  it('returns 400 when message is missing', async () => {
    const session = await createSession();

    const noMsg = await request(app).post(`/api/session/${session.id}/chat`).send({});
    expect(noMsg.status).toBe(400);

    const numMsg = await request(app).post(`/api/session/${session.id}/chat`).send({ message: 123 });
    expect(numMsg.status).toBe(400);
  });
});

// ===========================================================================
// Reference resolution
// ===========================================================================

describe('Reference resolution', () => {
  // E1
  it('resolves inline [file:start:end] references from file content', async () => {
    const session = await createSession();
    mkdirSync(join(tempDir, session.id), { recursive: true });
    writeFileSync(join(tempDir, session.id, 'notes.md'), 'line1\nline2\nline3\n');

    mockStreamTeacher.mockResolvedValue(mockStream([{ type: 'text-delta', text: 'ok' }]) as any);

    await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'see [notes.md:1:2]' });

    const call = mockStreamTeacher.mock.calls[0];
    const llmMessages = call[2] as Array<{ role: string; content: string }>;
    const lastMsg = llmMessages[llmMessages.length - 1];
    expect(lastMsg.content).toContain('line1');
    expect(lastMsg.content).toContain('line2');
    expect(lastMsg.content).toContain('<selection');
    expect(lastMsg.content).toContain('notes.md');
    expect(lastMsg.content).toContain('lines="1-2"');
  });

  // X3
  it('skips non-existent referenced file silently', async () => {
    const session = await createSession();

    mockStreamTeacher.mockResolvedValue(mockStream([{ type: 'text-delta', text: 'ok' }]) as any);

    await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'read [missing.md]' });

    const call = mockStreamTeacher.mock.calls[0];
    const llmMessages = call[2] as Array<{ role: string; content: string }>;
    const lastMsg = llmMessages[llmMessages.length - 1];
    expect(lastMsg.content).not.toContain('<selection');
  });
});

// ===========================================================================
// Message persistence
// ===========================================================================

describe('Message persistence', () => {
  // E4
  it('saves user message with original text, not resolved content', async () => {
    const session = await createSession();
    mkdirSync(join(tempDir, session.id), { recursive: true });
    writeFileSync(join(tempDir, session.id, 'data.md'), 'secret\n');

    mockStreamTeacher.mockResolvedValue(mockStream([{ type: 'text-delta', text: 'reply' }]) as any);

    await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'read [data.md]' });

    const messages = store.getMessages(session.id);
    const userMsg = messages.find((m) => m.role === 'user')!;
    expect(userMsg.content).toBe('read [data.md]');
    expect(userMsg.content).not.toContain('secret');
  });

  // E5
  it('saves assistant message with content, toolEvents, and parts', async () => {
    const session = await createSession();

    mockStreamTeacher.mockResolvedValue(
      mockStream([
        { type: 'text-delta', text: 'Hello ' },
        { type: 'text-delta', text: 'world' },
        { type: 'tool-call', toolName: 'read_file', input: { path: 'a.md' } },
        { type: 'tool-result', toolName: 'read_file', output: { content: 'data' } },
        { type: 'text-delta', text: '!' },
      ]) as any,
    );

    await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'hello' });

    const messages = store.getMessages(session.id);
    const assistantMsg = messages.find((m) => m.role === 'assistant')!;

    expect(assistantMsg.content).toBe('Hello world!');
    expect(assistantMsg.toolEvents).toHaveLength(2);
    expect(assistantMsg.toolEvents![0].type).toBe('tool-call');
    expect(assistantMsg.toolEvents![1].type).toBe('tool-result');
    expect(assistantMsg.parts).toHaveLength(4);
    expect(assistantMsg.parts![0]).toEqual({ type: 'text', content: 'Hello world' });
    expect(assistantMsg.parts![1]).toEqual({
      type: 'tool-call',
      toolName: 'read_file',
      args: { path: 'a.md' },
    });
    expect(assistantMsg.parts![2]).toEqual({
      type: 'tool-result',
      toolName: 'read_file',
      result: { content: 'data' },
    });
    expect(assistantMsg.parts![3]).toEqual({ type: 'text', content: '!' });
  });

  // X4
  it('does not save assistant message when LLM returns empty', async () => {
    const session = await createSession();

    mockStreamTeacher.mockResolvedValue(mockStream([]) as any);

    await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'hello' });

    const messages = store.getMessages(session.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
  });
});

// ===========================================================================
// LLM not configured
// ===========================================================================

describe('LLM not configured', () => {
  // E6
  it('sends error text-delta + done when LLM not configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    const session = await createSession();

    const res = await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'hello' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSSE(res.text);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('text-delta');
    expect(events[0].content).toContain('LLM 未配置');
    expect(events[1].type).toBe('done');
    expect(mockStreamTeacher).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Streaming event forwarding
// ===========================================================================

describe('Streaming event forwarding', () => {
  // S1
  it('forwards text-delta as SSE', async () => {
    const session = await createSession();
    mockStreamTeacher.mockResolvedValue(mockStream([{ type: 'text-delta', text: 'Hi there' }]) as any);

    const res = await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'hello' });

    const events = parseSSE(res.text);
    const textDeltas = events.filter((e) => e.type === 'text-delta');
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0].content).toBe('Hi there');
  });

  // S2
  it('forwards tool-call as SSE', async () => {
    const session = await createSession();
    mockStreamTeacher.mockResolvedValue(
      mockStream([{ type: 'tool-call', toolName: 'write_file', input: { path: 'x.md', content: 'yo' } }]) as any,
    );

    const res = await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'create file' });

    const events = parseSSE(res.text);
    const toolCalls = events.filter((e) => e.type === 'tool-call');
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].toolName).toBe('write_file');
    expect(toolCalls[0].args).toEqual({ path: 'x.md', content: 'yo' });
  });

  // S3
  it('forwards tool-result as SSE', async () => {
    const session = await createSession();
    mockStreamTeacher.mockResolvedValue(
      mockStream([{ type: 'tool-result', toolName: 'read_file', output: { content: 'file data' } }]) as any,
    );

    const res = await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'read file' });

    const events = parseSSE(res.text);
    const results = events.filter((e) => e.type === 'tool-result');
    expect(results).toHaveLength(1);
    expect(results[0].toolName).toBe('read_file');
    expect(results[0].result).toEqual({ content: 'file data' });
  });

  // E7
  it('does not forward reasoning-delta to SSE', async () => {
    const session = await createSession();
    mockStreamTeacher.mockResolvedValue(
      mockStream([
        { type: 'reasoning-delta' },
        { type: 'text-delta', text: 'answer' },
        { type: 'reasoning-delta' },
      ]) as any,
    );

    const res = await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'think' });

    const events = parseSSE(res.text);
    const reasoningEvents = events.filter((e) => e.type === 'reasoning-delta');
    expect(reasoningEvents).toHaveLength(0);
    const textDeltas = events.filter((e) => e.type === 'text-delta');
    expect(textDeltas).toHaveLength(1);
  });

  // U1
  it('has Content-Type text/event-stream and ends with done', async () => {
    const session = await createSession();
    mockStreamTeacher.mockResolvedValue(mockStream([{ type: 'text-delta', text: 'hi' }]) as any);

    const res = await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'hello' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSSE(res.text);
    expect(events[events.length - 1].type).toBe('done');
  });
});

// ===========================================================================
// Part accumulation
// ===========================================================================

describe('Part accumulation', () => {
  // S4
  it('merges consecutive text-deltas into one text part', async () => {
    const session = await createSession();
    mockStreamTeacher.mockResolvedValue(
      mockStream([
        { type: 'text-delta', text: 'aaa' },
        { type: 'text-delta', text: 'bbb' },
        { type: 'text-delta', text: 'ccc' },
      ]) as any,
    );

    await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'go' });

    const messages = store.getMessages(session.id);
    const assistant = messages.find((m) => m.role === 'assistant')!;
    expect(assistant.parts).toHaveLength(1);
    expect(assistant.parts![0]).toEqual({ type: 'text', content: 'aaabbbccc' });
  });

  // E8
  it('tool-call breaks text merge — creates separate parts', async () => {
    const session = await createSession();
    mockStreamTeacher.mockResolvedValue(
      mockStream([
        { type: 'text-delta', text: 'before' },
        { type: 'tool-call', toolName: 'read_file', input: { path: 'f.md' } },
        { type: 'text-delta', text: 'after' },
      ]) as any,
    );

    await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'go' });

    const messages = store.getMessages(session.id);
    const assistant = messages.find((m) => m.role === 'assistant')!;
    expect(assistant.parts).toHaveLength(3);
    expect(assistant.parts![0]).toEqual({ type: 'text', content: 'before' });
    expect(assistant.parts![1].type).toBe('tool-call');
    expect(assistant.parts![2]).toEqual({ type: 'text', content: 'after' });
  });

  // E9
  it('tool-result breaks text merge — creates separate parts', async () => {
    const session = await createSession();
    mockStreamTeacher.mockResolvedValue(
      mockStream([
        { type: 'text-delta', text: 'start' },
        { type: 'tool-result', toolName: 'read_file', output: 'result-data' },
        { type: 'text-delta', text: 'end' },
      ]) as any,
    );

    await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'go' });

    const messages = store.getMessages(session.id);
    const assistant = messages.find((m) => m.role === 'assistant')!;
    expect(assistant.parts).toHaveLength(3);
    expect(assistant.parts![0]).toEqual({ type: 'text', content: 'start' });
    expect(assistant.parts![1].type).toBe('tool-result');
    expect(assistant.parts![2]).toEqual({ type: 'text', content: 'end' });
  });
});

// ===========================================================================
// Error handling
// ===========================================================================

describe('Error handling', () => {
  // X5a — streamTeacherResponse promise rejects
  it('sends SSE error event when streamTeacherResponse rejects', async () => {
    const session = await createSession();
    mockStreamTeacher.mockRejectedValue(new Error('LLM connection failed'));

    const res = await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'hello' });

    const events = parseSSE(res.text);
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].error).toBe('LLM connection failed');
  });

  // X5b — fullStream async iterator throws mid-stream
  it('sends SSE error event when stream iterator throws mid-iteration', async () => {
    const session = await createSession();
    mockStreamTeacher.mockResolvedValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'partial' };
        throw new Error('stream interrupted');
      })(),
    } as any);

    const res = await request(app).post(`/api/session/${session.id}/chat`).send({ message: 'hello' });

    const events = parseSSE(res.text);
    const textDeltas = events.filter((e) => e.type === 'text-delta');
    expect(textDeltas.length).toBeGreaterThanOrEqual(1);
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].error).toBe('stream interrupted');
  });
});
