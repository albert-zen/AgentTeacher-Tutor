import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { Session } from '../types.js';
import type { Store } from '../db/index.js';
import { FileService } from '../services/fileService.js';
import { parseMilestones } from '../services/milestonesParser.js';
import { assembleContext } from '../services/contextCompiler.js';
import { loadSessionContextConfig, saveSessionContextConfig } from '../services/toolConfig.js';
import { buildSessionContextMemory } from '../services/contextPreview.js';

const DEFAULT_MESSAGE_PAGE_SIZE = 50;
const MAX_MESSAGE_PAGE_SIZE = 100;

function parseMessageLimit(rawLimit: unknown): number | null {
  if (rawLimit === undefined) return DEFAULT_MESSAGE_PAGE_SIZE;
  const parsed = Number(rawLimit);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return Math.min(parsed, MAX_MESSAGE_PAGE_SIZE);
}

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

    const draftPath = join(dataDir, 'session-prompt-draft.md');
    if (existsSync(draftPath)) {
      const draft = readFileSync(draftPath, 'utf-8').trim();
      if (draft) {
        writeFileSync(join(dataDir, session.id, 'session-prompt.md'), draft);
      }
    }

    res.json(session);
  });

  // Get session
  router.get('/:id', (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const limit = parseMessageLimit(req.query.limit);
    if (limit === null) {
      res.status(400).json({ error: 'limit must be a positive integer' });
      return;
    }

    const page = store.getMessagesPage(session.id, { limit });
    res.json({
      session,
      messages: page?.items ?? [],
      nextCursor: page?.nextCursor ?? null,
      hasMore: page?.hasMore ?? false,
    });
  });

  router.get('/:id/messages', (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const limit = parseMessageLimit(req.query.limit);
    if (limit === null) {
      res.status(400).json({ error: 'limit must be a positive integer' });
      return;
    }

    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const page = store.getMessagesPage(session.id, { beforeMessageId: before, limit });

    if (!page && before) {
      res.status(400).json({ error: 'Invalid message cursor' });
      return;
    }

    res.json(page ?? { items: [], nextCursor: null, hasMore: false });
  });

  // Context preview
  router.get('/:id/context-preview', (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const context = assembleContext(dataDir, session.id, loadSessionContextConfig(dataDir, session.id));
    res.json(context);
  });

  router.get('/:id/context-memory', (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const preview = buildSessionContextMemory(dataDir, store, session.id);
    res.json(preview);
  });

  // Save context config
  router.put('/:id/context-config', (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    saveSessionContextConfig(dataDir, session.id, req.body);
    res.json({ success: true });
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
