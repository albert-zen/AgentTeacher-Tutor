import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { join } from 'path';
import type { Session, ChatMessage } from '../types.js';
import type { Store } from '../db/index.js';
import { FileService } from '../services/fileService.js';
import { parseReferences } from '../services/referenceParser.js';
import { createLLMClient, streamTeacherResponse, isLLMConfigured, type LLMConfig } from '../services/llm.js';
import type { CoreMessage } from 'ai';

export function createSessionRouter(store: Store, dataDir: string, llmConfig: LLMConfig) {
  const router = Router();
  const llmReady = isLLMConfigured(llmConfig);
  const model = llmReady ? createLLMClient(llmConfig) : null;

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
          resolvedParts.push(`--- Referenced: ${ref.file}${ref.startLine ? `:${ref.startLine}:${ref.endLine}` : ''} ---\n${result.content}\n---`);
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

    // Save user message
    const userMsg: ChatMessage = {
      id: uuid(),
      sessionId: session.id,
      role: 'user',
      content: message,
      references: refs.length > 0 ? refs : undefined,
      createdAt: new Date().toISOString(),
    };
    store.addMessage(userMsg);

    // Build conversation history for LLM
    const history = store.getMessages(session.id);
    const coreMessages: CoreMessage[] = history.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    // Last message is the current user message with resolved references
    coreMessages.push({ role: 'user', content: userContent });

    // SSE streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!model) {
      res.write(`data: ${JSON.stringify({ type: 'text-delta', content: '[LLM 未配置] 请在 .env 中设置 LLM_API_KEY 后重启 server。当前可以正常使用文件管理、笔记编辑等功能。' })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
      return;
    }

    try {
      const result = await streamTeacherResponse(model, fileService, coreMessages);

      let fullText = '';

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          fullText += part.textDelta;
          res.write(`data: ${JSON.stringify({ type: 'text-delta', content: part.textDelta })}\n\n`);
        } else if (part.type === 'tool-call') {
          res.write(`data: ${JSON.stringify({ type: 'tool-call', name: part.toolName, args: part.args })}\n\n`);
        } else if (part.type === 'tool-result') {
          res.write(`data: ${JSON.stringify({ type: 'tool-result', name: part.toolName, result: part.result })}\n\n`);
        }
      }

      // Save assistant message
      if (fullText.trim()) {
        const assistantMsg: ChatMessage = {
          id: uuid(),
          sessionId: session.id,
          role: 'assistant',
          content: fullText,
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

  return router;
}
