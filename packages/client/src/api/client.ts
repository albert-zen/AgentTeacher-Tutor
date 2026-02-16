const BASE = '/api';

export interface Session {
  id: string;
  concept: string;
  createdAt: string;
}

export interface ToolEvent {
  type: 'tool-call' | 'tool-result';
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  references?: FileRef[];
  toolEvents?: ToolEvent[];
  createdAt: string;
}

export interface FileRef {
  file: string;
  startLine?: number;
  endLine?: number;
}

export interface FileContent {
  content: string;
  totalLines: number;
}

export async function createSession(concept: string): Promise<Session> {
  const res = await fetch(`${BASE}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ concept }),
  });
  return res.json();
}

export async function getSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE}/session`);
  return res.json();
}

export async function getSession(id: string): Promise<{ session: Session; messages: ChatMessage[] }> {
  const res = await fetch(`${BASE}/session/${id}`);
  return res.json();
}

export async function getFiles(sessionId: string): Promise<string[]> {
  const res = await fetch(`${BASE}/${sessionId}/files`);
  return res.json();
}

export async function readFile(sessionId: string, filePath: string): Promise<FileContent> {
  const res = await fetch(`${BASE}/${sessionId}/file?path=${encodeURIComponent(filePath)}`);
  return res.json();
}

export async function writeFile(sessionId: string, filePath: string, content: string): Promise<void> {
  await fetch(`${BASE}/${sessionId}/file`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });
}

export async function deleteFile(sessionId: string, filePath: string): Promise<void> {
  await fetch(`${BASE}/${sessionId}/file?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
}

export async function getProfile(): Promise<FileContent> {
  const res = await fetch(`${BASE}/profile`);
  return res.json();
}

export async function updateProfile(content: string): Promise<void> {
  await fetch(`${BASE}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export interface SSEEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'done' | 'error';
  content?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export function streamChat(
  sessionId: string,
  message: string,
  references?: FileRef[],
  onEvent?: (event: SSEEvent) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE}/session/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, references }),
    signal: controller.signal,
  }).then(async (res) => {
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));
            onEvent?.(event);
          } catch { /* skip */ }
        }
      }
    }
  });

  return controller;
}
