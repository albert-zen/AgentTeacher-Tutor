import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Session, ChatMessage } from '../types.js';

/**
 * Simple JSON-file-based storage for sessions and messages.
 * Each session has its own directory under dataDir.
 */
export class Store {
  constructor(private dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
  }

  private sessionsFile(): string {
    return join(this.dataDir, 'sessions.json');
  }

  private messagesFile(sessionId: string): string {
    return join(this.dataDir, sessionId, 'messages.json');
  }

  // === Sessions ===

  getSessions(): Session[] {
    const file = this.sessionsFile();
    if (!existsSync(file)) return [];
    return JSON.parse(readFileSync(file, 'utf-8'));
  }

  getSession(id: string): Session | undefined {
    return this.getSessions().find((s) => s.id === id);
  }

  createSession(session: Session): void {
    const sessions = this.getSessions();
    sessions.push(session);
    writeFileSync(this.sessionsFile(), JSON.stringify(sessions, null, 2));
    // Create session directory for files
    const sessionDir = join(this.dataDir, session.id);
    mkdirSync(sessionDir, { recursive: true });
  }

  updateSession(id: string, patch: Partial<Omit<Session, 'id'>>): Session | undefined {
    const sessions = this.getSessions();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) return undefined;
    sessions[idx] = { ...sessions[idx], ...patch };
    writeFileSync(this.sessionsFile(), JSON.stringify(sessions, null, 2));
    return sessions[idx];
  }

  // === Messages ===

  getMessages(sessionId: string): ChatMessage[] {
    const file = this.messagesFile(sessionId);
    if (!existsSync(file)) return [];
    return JSON.parse(readFileSync(file, 'utf-8'));
  }

  addMessage(message: ChatMessage): void {
    const file = this.messagesFile(message.sessionId);
    const dir = join(this.dataDir, message.sessionId);
    mkdirSync(dir, { recursive: true });
    const messages = this.getMessages(message.sessionId);
    messages.push(message);
    writeFileSync(file, JSON.stringify(messages, null, 2));
  }
}
