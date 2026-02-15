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

// === Chat ===

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  references?: FileReference[];
  createdAt: string;
}

export interface ChatRequest {
  message: string;
  references?: FileReference[];
}
