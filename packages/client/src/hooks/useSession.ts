import { useState, useCallback, useRef } from 'react';
import * as api from '../api/client';
import type { SSEEvent } from '../api/client';

export function useSession() {
  const [session, setSession] = useState<api.Session | null>(null);
  const [messages, setMessages] = useState<api.ChatMessage[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
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
      const userMsg: api.ChatMessage = {
        id: Date.now().toString(),
        sessionId,
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      let text = '';

      abortRef.current = api.streamChat(sessionId, message, references, (event: SSEEvent) => {
        if (event.type === 'text-delta') {
          text += event.content ?? '';
          setStreamingText(text);
        } else if (event.type === 'tool-result') {
          // Refresh files whenever teacher modifies them
          refreshFilesBySessionId(sessionId);
        } else if (event.type === 'done') {
          if (text.trim()) {
            const assistantMsg: api.ChatMessage = {
              id: (Date.now() + 1).toString(),
              sessionId,
              role: 'assistant',
              content: text,
              createdAt: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          }
          setStreamingText('');
          setStreaming(false);
          refreshFilesBySessionId(sessionId);
        } else if (event.type === 'error') {
          setStreaming(false);
          setStreamingText('');
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

  const send = useCallback(
    (message: string, references: api.FileRef[] = []) => {
      if (!sessionRef.current) return;
      sendMessage(sessionRef.current.id, message, references);
    },
    [sendMessage],
  );

  return {
    session,
    messages,
    files,
    streaming,
    streamingText,
    startSession,
    send,
    refreshFiles,
  };
}
