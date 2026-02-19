const BASE = '/api';

async function assertOk(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${body}`);
  }
}

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

export type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'tool-call'; toolName: string; args?: Record<string, unknown> }
  | { type: 'tool-result'; toolName: string; result?: unknown };

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  /** User message with inline references resolved to <selection> tags */
  resolvedContent?: string;
  references?: FileRef[];
  toolEvents?: ToolEvent[];
  parts?: MessagePart[];
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

export interface CopySource {
  file: string;
  startLine: number;
  endLine: number;
  text: string;
}

export type Attachment =
  | { type: 'file-ref'; file: string; startLine: number; endLine: number; preview: string }
  | { type: 'quote'; text: string };

export async function createSession(concept: string): Promise<Session> {
  const res = await fetch(`${BASE}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ concept }),
  });
  await assertOk(res);
  return res.json();
}

export async function getSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE}/session`);
  await assertOk(res);
  return res.json();
}

export async function getSession(id: string): Promise<{ session: Session; messages: ChatMessage[] }> {
  const res = await fetch(`${BASE}/session/${id}`);
  await assertOk(res);
  return res.json();
}

export async function getFiles(sessionId: string): Promise<string[]> {
  const res = await fetch(`${BASE}/${sessionId}/files`);
  await assertOk(res);
  return res.json();
}

export async function readFile(sessionId: string, filePath: string): Promise<FileContent> {
  const res = await fetch(`${BASE}/${sessionId}/file?path=${encodeURIComponent(filePath)}`);
  await assertOk(res);
  return res.json();
}

export async function writeFile(sessionId: string, filePath: string, content: string): Promise<void> {
  const res = await fetch(`${BASE}/${sessionId}/file`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });
  await assertOk(res);
}

export async function deleteFile(sessionId: string, filePath: string): Promise<void> {
  const res = await fetch(`${BASE}/${sessionId}/file?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
  await assertOk(res);
}

export async function getProfile(): Promise<FileContent> {
  const res = await fetch(`${BASE}/profile`);
  await assertOk(res);
  return res.json();
}

export async function updateProfile(content: string): Promise<void> {
  const res = await fetch(`${BASE}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  await assertOk(res);
}

export interface ProfileBlock {
  id: string;
  name: string;
  content: string;
}

export async function getProfileBlocks(): Promise<ProfileBlock[]> {
  const res = await fetch(`${BASE}/profile/blocks`);
  await assertOk(res);
  return res.json();
}

export async function getSessionPromptDraft(): Promise<FileContent> {
  const res = await fetch(`${BASE}/session-prompt-draft`);
  await assertOk(res);
  return res.json();
}

export async function updateSessionPromptDraft(content: string): Promise<void> {
  const res = await fetch(`${BASE}/session-prompt-draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  await assertOk(res);
}

export async function getSystemPrompt(): Promise<FileContent & { defaultContent: string }> {
  const res = await fetch(`${BASE}/system-prompt`);
  await assertOk(res);
  return res.json();
}

export async function updateSystemPrompt(content: string): Promise<void> {
  const res = await fetch(`${BASE}/system-prompt`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  await assertOk(res);
}

export interface LLMStatus {
  configured: boolean;
  provider: string;
  model: string;
  baseURL: string;
}

export async function getLLMStatus(): Promise<LLMStatus> {
  const res = await fetch(`${BASE}/llm-status`);
  await assertOk(res);
  return res.json();
}

export async function updateLLMConfig(config: {
  provider?: string;
  apiKey?: string;
  baseURL?: string;
  model?: string;
}): Promise<LLMStatus> {
  const res = await fetch(`${BASE}/llm-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  await assertOk(res);
  return res.json();
}

export interface MilestoneProgress {
  total: number;
  completed: number;
}

export async function getSessionMilestones(sessionId: string): Promise<MilestoneProgress> {
  const res = await fetch(`${BASE}/session/${sessionId}/milestones`);
  await assertOk(res);
  return res.json();
}

export interface ContextPreview {
  systemPrompt: string;
  profileBlocks: ProfileBlock[];
  selectedProfileContent: string;
}

export async function getContextPreview(sessionId: string): Promise<ContextPreview> {
  const res = await fetch(`${BASE}/session/${sessionId}/context-preview`);
  await assertOk(res);
  return res.json();
}

export async function updateContextConfig(sessionId: string, config: { profileBlockIds?: string[] }): Promise<void> {
  const res = await fetch(`${BASE}/session/${sessionId}/context-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  await assertOk(res);
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
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        onEvent?.({ type: 'error', error: `API error ${res.status}: ${body}` });
        return;
      }
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
            } catch {
              /* skip */
            }
          }
        }
      }
    })
    .catch((err: unknown) => {
      if ((err as DOMException)?.name === 'AbortError') return;
      onEvent?.({ type: 'error', error: String(err) });
    });

  return controller;
}
