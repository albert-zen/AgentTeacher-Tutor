import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Store } from '../src/db/index.js';
import type { Session, ChatMessage } from '../src/types.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'teacher-store-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    concept: 'binary search',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    sessionId: 'sess-1',
    role: 'user',
    content: 'hello',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Store', () => {
  // U1
  it('creates the data directory on construction if it does not exist', () => {
    const nested = join(tempDir, 'deep', 'nested', 'data');
    expect(existsSync(nested)).toBe(false);
    new Store(nested);
    expect(existsSync(nested)).toBe(true);
  });

  // E1
  it('createSession persists the session to sessions.json and creates the session subdirectory', () => {
    const store = new Store(tempDir);
    const session = makeSession();
    store.createSession(session);

    const raw = JSON.parse(readFileSync(join(tempDir, 'sessions.json'), 'utf-8'));
    expect(raw).toEqual([session]);
    expect(existsSync(join(tempDir, session.id))).toBe(true);
  });

  // E2
  it('getSessions returns all persisted sessions', () => {
    const store = new Store(tempDir);
    const s1 = makeSession({ id: 'sess-1', concept: 'arrays' });
    const s2 = makeSession({ id: 'sess-2', concept: 'trees' });
    store.createSession(s1);
    store.createSession(s2);

    const result = store.getSessions();
    expect(result).toEqual([s1, s2]);
  });

  // E3
  it('getSession returns the matching session by id', () => {
    const store = new Store(tempDir);
    const s1 = makeSession({ id: 'sess-1' });
    const s2 = makeSession({ id: 'sess-2', concept: 'graphs' });
    store.createSession(s1);
    store.createSession(s2);

    expect(store.getSession('sess-2')).toEqual(s2);
  });

  // E4
  it('addMessage appends the message to {sessionId}/messages.json', () => {
    const store = new Store(tempDir);
    store.createSession(makeSession());
    const msg = makeMessage();
    store.addMessage(msg);

    const raw = JSON.parse(readFileSync(join(tempDir, 'sess-1', 'messages.json'), 'utf-8'));
    expect(raw).toEqual([msg]);

    const msg2 = makeMessage({ id: 'msg-2', content: 'world' });
    store.addMessage(msg2);

    const raw2 = JSON.parse(readFileSync(join(tempDir, 'sess-1', 'messages.json'), 'utf-8'));
    expect(raw2).toEqual([msg, msg2]);
  });

  // E5
  it('getMessages returns all messages for a session', () => {
    const store = new Store(tempDir);
    store.createSession(makeSession());
    const msg1 = makeMessage({ id: 'msg-1', content: 'first' });
    const msg2 = makeMessage({ id: 'msg-2', role: 'assistant', content: 'second' });
    store.addMessage(msg1);
    store.addMessage(msg2);

    expect(store.getMessages('sess-1')).toEqual([msg1, msg2]);
  });

  // X1
  it('getSessions returns [] when sessions.json does not exist', () => {
    const store = new Store(tempDir);
    expect(store.getSessions()).toEqual([]);
  });

  // X2
  it('getMessages returns [] when messages.json does not exist', () => {
    const store = new Store(tempDir);
    expect(store.getMessages('nonexistent')).toEqual([]);
  });

  // X3
  it('getSession returns undefined for a non-existent id', () => {
    const store = new Store(tempDir);
    store.createSession(makeSession());
    expect(store.getSession('no-such-id')).toBeUndefined();
  });

  // E: updateSession
  it('updateSession updates session fields and persists', () => {
    const store = new Store(tempDir);
    store.createSession(makeSession({ id: 'upd-1', concept: 'old title' }));
    const updated = store.updateSession('upd-1', { concept: 'new title' });
    expect(updated?.concept).toBe('new title');
    // Verify persistence
    const reloaded = store.getSession('upd-1');
    expect(reloaded?.concept).toBe('new title');
  });

  // X: updateSession returns undefined for non-existent id
  it('updateSession returns undefined for non-existent id', () => {
    const store = new Store(tempDir);
    expect(store.updateSession('nope', { concept: 'x' })).toBeUndefined();
  });
});
