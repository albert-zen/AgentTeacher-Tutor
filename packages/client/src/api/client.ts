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

export interface MessagePage {
  items: ChatMessage[];
  nextCursor: string | null;
  hasMore: boolean;
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

export async function getSession(
  id: string,
  options?: { limit?: number },
): Promise<{ session: Session; messages: ChatMessage[]; nextCursor: string | null; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  const query = params.toString();
  const res = await fetch(`${BASE}/session/${id}${query ? `?${query}` : ''}`);
  await assertOk(res);
  return res.json();
}

export async function getSessionMessages(
  id: string,
  options: { before?: string; limit?: number } = {},
): Promise<MessagePage> {
  const params = new URLSearchParams();
  if (options.before) {
    params.set('before', options.before);
  }
  if (options.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  const query = params.toString();
  const res = await fetch(`${BASE}/session/${id}/messages${query ? `?${query}` : ''}`);
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

export type ToolId = 'read_file' | 'write_file' | 'fetch_url' | 'web_search' | 'browser';
export type ToolRuntimeMode = 'builtin' | 'local' | 'managed' | 'external';
export type ToolRuntimeStatus = 'disabled' | 'stopped' | 'starting' | 'ready' | 'error';

export interface BuiltinToolConfig {
  runtimeMode: 'builtin';
}

export interface WebSearchToolConfig {
  runtimeMode: 'local' | 'external';
  localProvider: 'duckduckgo';
  sidecar: {
    port: number;
  };
  backend: {
    port: number;
  };
  externalBaseURL: string;
  timeoutMs: number;
  defaultMaxResults: number;
  allowedCategories: string[];
  allowedEngines: string[];
  persistResultsByDefault: boolean;
}

export interface BrowserToolConfig {
  runtimeMode: 'managed' | 'external';
}

export type ToolConfig = BuiltinToolConfig | WebSearchToolConfig | BrowserToolConfig;

export type ProfileSelection = { mode: 'inherit_all' } | { mode: 'explicit'; blockIds: string[] };

export interface SessionDraftManifest {
  version: 1;
  profileSelection: ProfileSelection;
  enabledTools: ToolId[];
}

export interface SessionContextManifest {
  version: 1;
  profileSelection: ProfileSelection;
  enabledTools: ToolId[];
}

export interface ToolState {
  id: ToolId;
  label: string;
  description: string;
  enabled: boolean;
  exposeToModel: boolean;
  uiVisible: boolean;
  runtimeMode: ToolRuntimeMode;
  status: ToolRuntimeStatus;
  message?: string;
  config: ToolConfig;
}

export interface ToolConfigFile {
  version: 1;
  tools: Record<ToolId, ToolConfig>;
}

export interface ToolsResponse {
  tools: ToolState[];
  globalConfig: ToolConfigFile;
  manifest: SessionDraftManifest | null;
}

export interface SessionToolsResponse extends ToolsResponse {
  sessionConfig: SessionContextManifest | null;
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

export async function getTools(): Promise<ToolsResponse> {
  const res = await fetch(`${BASE}/tools`);
  await assertOk(res);
  return res.json();
}

export async function updateTool(
  toolId: ToolId,
  patch: Partial<ToolConfig>,
): Promise<ToolsResponse> {
  const res = await fetch(`${BASE}/tools/${toolId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  await assertOk(res);
  return res.json();
}

export async function runToolRuntimeAction(
  toolId: ToolId,
  action: 'start' | 'stop' | 'restart' | 'check',
): Promise<ToolState> {
  const res = await fetch(`${BASE}/tools/${toolId}/runtime/${action}`, {
    method: 'POST',
  });
  await assertOk(res);
  return res.json();
}

export async function getSessionTools(sessionId: string): Promise<SessionToolsResponse> {
  const res = await fetch(`${BASE}/session/${sessionId}/tools`);
  await assertOk(res);
  return res.json();
}

export async function updateSessionTool(
  sessionId: string,
  config: {
    toolId: ToolId;
    enabled?: boolean;
  },
): Promise<SessionToolsResponse> {
  const res = await fetch(`${BASE}/session/${sessionId}/tools`, {
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

export type ContextPreviewSectionKind =
  | 'system_prompt'
  | 'session_prompt_draft'
  | 'session_prompt'
  | 'tool_instructions'
  | 'profile_blocks'
  | 'history_turn';

export interface ContextPreviewProcessPart {
  id: string;
  kind: 'text' | 'tool-call' | 'tool-result';
  title: string;
  body?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

export interface ContextPreviewSection {
  id: string;
  kind: ContextPreviewSectionKind;
  title: string;
  summary: string;
  sourceLabel?: string;
  order: number;
  content?: string;
  meta?: Record<string, unknown>;
}

export interface ContextPreviewResponse {
  sections: ContextPreviewSection[];
}

export type SessionMemoryResponse = ContextPreviewResponse;

export async function getTemplateContextPreview(): Promise<ContextPreviewResponse> {
  const res = await fetch(`${BASE}/context-preview/template`);
  await assertOk(res);
  return res.json();
}

export async function getSessionContextMemory(sessionId: string): Promise<SessionMemoryResponse> {
  const res = await fetch(`${BASE}/session/${sessionId}/context-memory`);
  await assertOk(res);
  return res.json();
}

export interface SessionDraftResponse {
  manifest: SessionDraftManifest;
  sessionPrompt: string;
}

export async function getSessionDraft(): Promise<SessionDraftResponse> {
  const res = await fetch(`${BASE}/session-draft`);
  await assertOk(res);
  return res.json();
}

export async function updateSessionDraft(draft: SessionDraftResponse): Promise<SessionDraftResponse> {
  const res = await fetch(`${BASE}/session-draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  await assertOk(res);
  return res.json();
}

export interface SSEEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'done' | 'error';
  content?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export function streamChat(sessionId: string, message: string, onEvent?: (event: SSEEvent) => void): AbortController {
  const controller = new AbortController();

  fetch(`${BASE}/session/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
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
