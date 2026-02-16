// === File Operations ===

export interface ReadFileParams {
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface WriteFileParams {
  path: string;
  content: string;
  startLine?: number;
  endLine?: number;
}

export interface ReadFileResult {
  content: string;
  totalLines: number;
}

// === Reference ===

export interface FileReference {
  file: string;
  startLine?: number;
  endLine?: number;
}

// === Milestones ===

export interface MilestoneItem {
  name: string;
  completed: boolean;
}

export interface Milestones {
  title: string;
  items: MilestoneItem[];
}

// === Session ===

export interface Session {
  id: string;
  concept: string;
  createdAt: string;
}

// === Agent Events (optional — only present when agent is active) ===

export interface ToolEvent {
  type: 'tool-call' | 'tool-result';
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

// === Message Parts (ordered sequence of text and tool events) ===

export type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'tool-call'; toolName: string; args?: Record<string, unknown> }
  | { type: 'tool-result'; toolName: string; result?: unknown };

// === Chat ===

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  references?: FileReference[];
  /** Tool events that occurred during this response (agent layer, optional) */
  toolEvents?: ToolEvent[];
  /** Ordered sequence of text and tool events, preserving interleaving */
  parts?: MessagePart[];
  createdAt: string;
}

export interface ChatRequest {
  message: string;
  references?: FileReference[];
}

// === SSE Event Types ===

export interface SSETextDelta {
  type: 'text-delta';
  content: string;
}

export interface SSEToolCall {
  type: 'tool-call';
  toolName: string;
  args: Record<string, unknown>;
}

export interface SSEToolResult {
  type: 'tool-result';
  toolName: string;
  result: unknown;
}

export interface SSEDone {
  type: 'done';
}

export interface SSEError {
  type: 'error';
  error: string;
}

export type SSEEvent = SSETextDelta | SSEToolCall | SSEToolResult | SSEDone | SSEError;
