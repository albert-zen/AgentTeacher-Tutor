import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { join } from 'path';
import { existsSync } from 'fs';
import type { Session, ChatMessage, FileReference, ToolEvent, MessagePart } from '../types.js';
import type { Store } from '../db/index.js';
import { FileService } from '../services/fileService.js';
import { parseReferences } from '../services/referenceParser.js';
import { parseMilestones } from '../services/milestonesParser.js';
import {
  createLLMClient,
  streamTeacherResponse,
  resolveSystemPrompt,
  isLLMConfigured,
  loadLLMConfig,
} from '../services/llm.js';
import type { ModelMessage } from 'ai';

export function createSessionRouter(store: Store, dataDir: string) {
  const router = Router();

  // List sessions
  router.get('/', (_req, res) => {
    res.json(store.getSessions());
  });

  // Create session
  router.post('/', (req, res) => {
    const { concept } = req.body;
    if (!concept || typeof concept !== 'string') {
      res.status(400).json({ error: 'concept is required' });
      return;
    }
    const session: Session = {
      id: uuid(),
      concept,
      createdAt: new Date().toISOString(),
    };
    store.createSession(session);
    res.json(session);
  });

  // Get session
  router.get('/:id', (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const messages = store.getMessages(session.id);
    res.json({ session, messages });
  });

  // Chat (SSE streaming)
  router.post('/:id/chat', async (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { message, references } = req.body;
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const sessionDir = join(dataDir, session.id);
    const fileService = new FileService(sessionDir);

    // Build user message content with resolved references
    let userContent = message;
    const refs = parseReferences(message);
    if (refs.length > 0) {
      const resolvedParts: string[] = [];
      for (const ref of refs) {
        try {
          const result = fileService.readFile({
            path: ref.file,
            startLine: ref.startLine,
            endLine: ref.endLine,
          });
          resolvedParts.push(
            `--- Referenced: ${ref.file}${ref.startLine ? `:${ref.startLine}:${ref.endLine}` : ''} ---\n${result.content}\n---`,
          );
        } catch {
          // File not found, skip
        }
      }
      if (resolvedParts.length > 0) {
        userContent = `${message}\n\n${resolvedParts.join('\n\n')}`;
      }
    }

    // Also resolve explicit references from body
    if (references && Array.isArray(references)) {
      for (const ref of references) {
        if (ref.content) {
          userContent += `\n\n--- Referenced: ${ref.filePath ?? 'selection'} ---\n${ref.content}\n---`;
        }
      }
    }

    // Merge parsed inline refs + explicit body refs
    const allRefs: FileReference[] = [...refs];
    if (references && Array.isArray(references)) {
      for (const ref of references) {
        allRefs.push({
          file: ref.file ?? ref.filePath ?? 'selection',
          startLine: ref.startLine,
          endLine: ref.endLine,
        });
      }
    }

    // Save user message
    const userMsg: ChatMessage = {
      id: uuid(),
      sessionId: session.id,
      role: 'user',
      content: message,
      references: allRefs.length > 0 ? allRefs : undefined,
      createdAt: new Date().toISOString(),
    };
    store.addMessage(userMsg);

    // Build conversation history for LLM
    const history = store.getMessages(session.id);
    const llmMessages: ModelMessage[] = history.slice(0, -1).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    // Last message is the current user message with resolved references
    llmMessages.push({ role: 'user', content: userContent });

    // SSE streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const currentConfig = loadLLMConfig(dataDir);
    if (!isLLMConfigured(currentConfig)) {
      res.write(
        `data: ${JSON.stringify({ type: 'text-delta', content: '[LLM 未配置] 请在设置中配置模型，或在 .env 中设置 LLM_API_KEY。当前可以正常使用文件管理、笔记编辑等功能。' })}\n\n`,
      );
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
      return;
    }

    try {
      const model = createLLMClient(currentConfig);
      const result = await streamTeacherResponse(
        model,
        fileService,
        llmMessages,
        resolveSystemPrompt(dataDir, session.id),
      );

      let fullText = '';
      const toolEvents: ToolEvent[] = [];
      const parts: MessagePart[] = [];
      let currentTextPart: (MessagePart & { type: 'text' }) | null = null;

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          const delta = part.text ?? '';
          fullText += delta;
          if (delta) {
            if (currentTextPart) {
              currentTextPart.content += delta;
            } else {
              currentTextPart = { type: 'text', content: delta };
              parts.push(currentTextPart);
            }
            res.write(`data: ${JSON.stringify({ type: 'text-delta', content: delta })}\n\n`);
          }
        } else if (part.type === 'tool-call') {
          currentTextPart = null;
          const args = part.input as Record<string, unknown>;
          toolEvents.push({ type: 'tool-call', toolName: part.toolName, args });
          parts.push({ type: 'tool-call', toolName: part.toolName, args });
          res.write(`data: ${JSON.stringify({ type: 'tool-call', toolName: part.toolName, args })}\n\n`);
        } else if (part.type === 'tool-result') {
          currentTextPart = null;
          const toolResult = part.output;
          toolEvents.push({ type: 'tool-result', toolName: part.toolName, result: toolResult });
          parts.push({ type: 'tool-result', toolName: part.toolName, result: toolResult });
          res.write(
            `data: ${JSON.stringify({ type: 'tool-result', toolName: part.toolName, result: toolResult })}\n\n`,
          );
        } else if (part.type === 'reasoning-delta') {
          // GLM-4.7 reasoning tokens - skip, don't send to frontend
        }
      }

      // Save assistant message with ordered parts
      if (fullText.trim() || toolEvents.length > 0) {
        const assistantMsg: ChatMessage = {
          id: uuid(),
          sessionId: session.id,
          role: 'assistant',
          content: fullText,
          toolEvents: toolEvents.length > 0 ? toolEvents : undefined,
          parts: parts.length > 0 ? parts : undefined,
          createdAt: new Date().toISOString(),
        };
        store.addMessage(assistantMsg);
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  });

  // Get session milestones progress
  router.get('/:id/milestones', (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const milestonesPath = join(dataDir, session.id, 'milestones.md');
    if (!existsSync(milestonesPath)) {
      res.json({ total: 0, completed: 0 });
      return;
    }
    const fileService = new FileService(join(dataDir, session.id));
    const { content } = fileService.readFile({ path: 'milestones.md' });
    const milestones = parseMilestones(content);
    res.json({
      total: milestones.items.length,
      completed: milestones.items.filter((i) => i.completed).length,
    });
  });

  return router;
}
