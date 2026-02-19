import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { join } from 'path';
import type { ChatMessage, ToolEvent, MessagePart } from '../types.js';
import type { Store } from '../db/index.js';
import { FileService } from '../services/fileService.js';
import { parseReferences } from '../services/referenceParser.js';
import { createLLMClient, streamTeacherResponse, isLLMConfigured, loadLLMConfig } from '../services/llm.js';
import { compileContext } from '../services/contextCompiler.js';
import { generateText } from 'ai';

async function generateTitle(dataDir: string, store: Store, sessionId: string, userMessage: string) {
  const config = loadLLMConfig(dataDir);
  if (!isLLMConfigured(config)) return;

  const model = createLLMClient(config);
  const { text } = await generateText({
    model,
    prompt: `用3-5个字概括这个学习需求，只返回标题文字，不要引号不要标点：\n${userMessage}`,
    maxOutputTokens: 20,
  });

  const title = text.trim().slice(0, 30);
  if (title) {
    store.updateSession(sessionId, { concept: title });
  }
}

export function createChatRouter(store: Store, dataDir: string) {
  const router = Router();

  router.post('/:id/chat', async (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const sessionDir = join(dataDir, session.id);
    const fileService = new FileService(sessionDir);

    const refs = parseReferences(message);
    const compiled = compileContext(dataDir, store, session.id, message);

    const userMsg: ChatMessage = {
      id: uuid(),
      sessionId: session.id,
      role: 'user',
      content: message,
      resolvedContent: compiled.resolvedUserContent,
      references: refs.length > 0 ? refs : undefined,
      createdAt: new Date().toISOString(),
    };
    store.addMessage(userMsg);

    if (store.getMessages(session.id).length === 1) {
      generateTitle(dataDir, store, session.id, message).catch(() => {});
    }

    // SSE streaming
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
      const result = await streamTeacherResponse(model, fileService, compiled.messages, compiled.system);

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
          // GLM-4.7 reasoning tokens — skip
        }
      }

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`);
      res.end();
    }
  });

  return router;
}
