import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { Session } from '../types.js';
import type { Store } from '../db/index.js';
import { FileService } from '../services/fileService.js';
import { parseMilestones } from '../services/milestonesParser.js';
import { assembleContext } from '../services/contextCompiler.js';

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
    const messages = store.getMessages(session.id);
    res.json({ session, messages });
  });

  // Context preview
  router.get('/:id/context-preview', (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    let config = undefined;
    const configPath = join(dataDir, session.id, 'context-config.json');
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch {
        /* use defaults */
      }
    }

    const context = assembleContext(dataDir, session.id, config);
    res.json(context);
  });

  // Save context config
  router.put('/:id/context-config', (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const configPath = join(dataDir, session.id, 'context-config.json');
    writeFileSync(configPath, JSON.stringify(req.body, null, 2));
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
