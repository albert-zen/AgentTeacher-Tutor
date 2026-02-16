import { useState, useCallback, useRef } from 'react';
import * as api from '../api/client';
import type { SSEEvent, ToolEvent } from '../api/client';

export function useSession() {
  const [session, setSession] = useState<api.Session | null>(null);
  const [messages, setMessages] = useState<api.ChatMessage[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingToolEvents, setStreamingToolEvents] = useState<ToolEvent[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  // Use ref to always have latest session in callbacks
  const sessionRef = useRef<api.Session | null>(null);

  const refreshFilesBySessionId = useCallback(async (sessionId: string) => {
    const f = await api.getFiles(sessionId);
    setFiles(f.filter((name: string) => name !== 'messages.json'));
  }, []);

  const refreshFiles = useCallback(async () => {
    if (!sessionRef.current) return;
    refreshFilesBySessionId(sessionRef.current.id);
  }, [refreshFilesBySessionId]);

  const sendMessage = useCallback(
    (sessionId: string, message: string, references: api.FileRef[]) => {
      setStreaming(true);
      setStreamingText('');
      setStreamingToolEvents([]);
      const userMsg: api.ChatMessage = {
        id: Date.now().toString(),
        sessionId,
        role: 'user',
        content: message,
        references: references.length > 0 ? references : undefined,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      let text = '';
      const toolEvents: ToolEvent[] = [];

      abortRef.current = api.streamChat(sessionId, message, references, (event: SSEEvent) => {
        if (event.type === 'text-delta') {
          text += event.content ?? '';
          setStreamingText(text);
        } else if (event.type === 'tool-call') {
          toolEvents.push({ type: 'tool-call', toolName: event.toolName ?? 'unknown', args: event.args });
          setStreamingToolEvents([...toolEvents]);
        } else if (event.type === 'tool-result') {
          toolEvents.push({ type: 'tool-result', toolName: event.toolName ?? 'unknown', result: event.result });
          setStreamingToolEvents([...toolEvents]);
          refreshFilesBySessionId(sessionId);
        } else if (event.type === 'done') {
          if (text.trim() || toolEvents.length > 0) {
            const assistantMsg: api.ChatMessage = {
              id: (Date.now() + 1).toString(),
              sessionId,
              role: 'assistant',
              content: text,
              toolEvents: toolEvents.length > 0 ? [...toolEvents] : undefined,
              createdAt: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          }
          setStreamingText('');
          setStreamingToolEvents([]);
          setStreaming(false);
          refreshFilesBySessionId(sessionId);
        } else if (event.type === 'error') {
          setStreaming(false);
          setStreamingText('');
          setStreamingToolEvents([]);
        }
      });
    },
    [refreshFilesBySessionId],
  );

  const startSession = useCallback(async (concept: string) => {
    const sess = await api.createSession(concept);
    setSession(sess);
    sessionRef.current = sess;
    setMessages([]);
    setFiles([]);
    sendMessage(sess.id, `我想学习：${concept}`, []);
  }, [sendMessage]);

  const loadSession = useCallback(async (id: string) => {
    const data = await api.getSession(id);
    setSession(data.session);
    sessionRef.current = data.session;
    setMessages(data.messages);
    await refreshFilesBySessionId(id);
  }, [refreshFilesBySessionId]);

  const send = useCallback(
    (message: string, references: api.FileRef[] = []) => {
      if (!sessionRef.current) return;
      sendMessage(sessionRef.current.id, message, references);
    },
    [sendMessage],
  );

  const clearSession = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setSession(null);
    sessionRef.current = null;
    setMessages([]);
    setFiles([]);
    setStreaming(false);
    setStreamingText('');
    setStreamingToolEvents([]);
  }, []);

  return {
    session,
    messages,
    files,
    streaming,
    streamingText,
    streamingToolEvents,
    startSession,
    loadSession,
    clearSession,
    send,
    refreshFiles,
  };
}
