import { useState, useCallback, useRef } from 'react';
import * as api from '../api/client';
import type { SSEEvent, MessagePart } from '../api/client';
import { extractReferencesFromText } from '../utils/serializeEditor';

const MESSAGE_PAGE_SIZE = 50;

function prependUniqueMessages(olderMessages: api.ChatMessage[], currentMessages: api.ChatMessage[]) {
  const seen = new Set(currentMessages.map((message) => message.id));
  const uniqueOlderMessages = olderMessages.filter((message) => !seen.has(message.id));
  return [...uniqueOlderMessages, ...currentMessages];
}

export function useSession() {
  const [session, setSession] = useState<api.Session | null>(null);
  const [messages, setMessages] = useState<api.ChatMessage[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingParts, setStreamingParts] = useState<MessagePart[]>([]);
  const [writingFile, setWritingFile] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<{ message: string } | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<api.Session | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);

  const refreshFilesBySessionId = useCallback(async (sessionId: string) => {
    const f = await api.getFiles(sessionId);
    setFiles(f.filter((name: string) => name !== 'messages.json'));
  }, []);

  const refreshFiles = useCallback(async () => {
    if (!sessionRef.current) return;
    refreshFilesBySessionId(sessionRef.current.id);
  }, [refreshFilesBySessionId]);

  const sendMessage = useCallback(
    (sessionId: string, message: string) => {
      setStreaming(true);
      setStreamingParts([]);
      setFailedMessage(null);
      const refs = extractReferencesFromText(message);
      const userMsg: api.ChatMessage = {
        id: Date.now().toString(),
        sessionId,
        role: 'user',
        content: message,
        references: refs.length > 0 ? refs : undefined,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      let fullText = '';
      const parts: MessagePart[] = [];
      let currentTextPart: (MessagePart & { type: 'text' }) | null = null;

      abortRef.current = api.streamChat(sessionId, message, (event: SSEEvent) => {
        if (event.type === 'text-delta') {
          const delta = event.content ?? '';
          fullText += delta;
          if (delta) {
            if (currentTextPart) {
              currentTextPart.content += delta;
            } else {
              currentTextPart = { type: 'text', content: delta };
              parts.push(currentTextPart);
            }
            setStreamingParts([...parts]);
          }
        } else if (event.type === 'tool-call') {
          currentTextPart = null;
          if (event.toolName === 'write_file') {
            setWritingFile(((event.args as Record<string, unknown>)?.path as string) ?? null);
          }
          parts.push({ type: 'tool-call', toolName: event.toolName ?? 'unknown', args: event.args });
          setStreamingParts([...parts]);
        } else if (event.type === 'tool-result') {
          currentTextPart = null;
          setWritingFile(null);
          parts.push({ type: 'tool-result', toolName: event.toolName ?? 'unknown', result: event.result });
          setStreamingParts([...parts]);
          refreshFilesBySessionId(sessionId);
        } else if (event.type === 'done') {
          if (fullText.trim() || parts.length > 0) {
            const assistantMsg: api.ChatMessage = {
              id: (Date.now() + 1).toString(),
              sessionId,
              role: 'assistant',
              content: fullText,
              parts: parts.length > 0 ? [...parts] : undefined,
              createdAt: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          }
          setStreamingParts([]);
          setStreaming(false);
          setWritingFile(null);
          setFailedMessage(null);
          refreshFilesBySessionId(sessionId);
          api
            .getSession(sessionId)
            .then((data) => {
              setSession(data.session);
              sessionRef.current = data.session;
            })
            .catch(() => {});
        } else if (event.type === 'error') {
          setStreaming(false);
          setStreamingParts([]);
          setWritingFile(null);
          setFailedMessage({ message });
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        }
      });
    },
    [refreshFilesBySessionId],
  );

  const startSession = useCallback(
    async (concept: string) => {
      const sess = await api.createSession(concept);
      setSession(sess);
      sessionRef.current = sess;
      setMessages([]);
      setHasMoreHistory(false);
      setLoadingOlder(false);
      setHistoryError(null);
      nextCursorRef.current = null;
      loadingOlderRef.current = false;
      setFiles([]);
      sendMessage(sess.id, concept);
    },
    [sendMessage],
  );

  const loadSession = useCallback(
    async (id: string) => {
      const data = await api.getSession(id, { limit: MESSAGE_PAGE_SIZE });
      setSession(data.session);
      sessionRef.current = data.session;
      setMessages(data.messages);
      setHasMoreHistory(data.hasMore);
      setLoadingOlder(false);
      setHistoryError(null);
      nextCursorRef.current = data.nextCursor;
      loadingOlderRef.current = false;
      await refreshFilesBySessionId(id);
    },
    [refreshFilesBySessionId],
  );

  const loadOlderMessages = useCallback(async () => {
    if (!sessionRef.current || loadingOlderRef.current || !hasMoreHistory) return false;

    const before = nextCursorRef.current ?? messages[0]?.id;
    if (!before) return false;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setHistoryError(null);

    try {
      const page = await api.getSessionMessages(sessionRef.current.id, {
        before,
        limit: MESSAGE_PAGE_SIZE,
      });
      setMessages((prev) => prependUniqueMessages(page.items, prev));
      setHasMoreHistory(page.hasMore);
      nextCursorRef.current = page.nextCursor;
      return true;
    } catch (error: unknown) {
      setHistoryError(error instanceof Error && error.message ? error.message : '加载更早消息失败');
      return false;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [hasMoreHistory, messages]);

  const send = useCallback(
    (message: string) => {
      if (!sessionRef.current) return;
      sendMessage(sessionRef.current.id, message);
    },
    [sendMessage],
  );

  const retrySend = useCallback(() => {
    if (!failedMessage || !sessionRef.current) return;
    const { message } = failedMessage;
    setFailedMessage(null);
    sendMessage(sessionRef.current.id, message);
  }, [failedMessage, sendMessage]);

  const clearSession = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setSession(null);
    sessionRef.current = null;
    setMessages([]);
    setHasMoreHistory(false);
    nextCursorRef.current = null;
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    setHistoryError(null);
    setFiles([]);
    setStreaming(false);
    setStreamingParts([]);
    setWritingFile(null);
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
    setStreamingParts([]);
    setWritingFile(null);
    setFailedMessage(null);
  }, []);

  return {
    session,
    messages,
    files,
    streaming,
    streamingParts,
    startSession,
    loadSession,
    clearSession,
    stopStreaming,
    send,
    refreshFiles,
    writingFile,
    failedMessage,
    retrySend,
    hasMoreHistory,
    loadingOlder,
    historyError,
    loadOlderMessages,
  };
}
