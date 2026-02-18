import { Router } from 'express';
import { join } from 'path';
import { readdirSync, existsSync, unlinkSync } from 'fs';
import { FileService } from '../services/fileService.js';
import type { Store } from '../db/index.js';
import {
  isLLMConfigured,
  getSystemPrompt as getDefaultSystemPrompt,
  loadLLMConfig,
  saveLLMConfig,
} from '../services/llm.js';

export function createFilesRouter(store: Store, dataDir: string) {
  const router = Router();

  function getFileService(sessionId: string): FileService | null {
    const session = store.getSession(sessionId);
    if (!session) return null;
    return new FileService(join(dataDir, sessionId));
  }

  // List files in session
  router.get('/:sessionId/files', (req, res) => {
    const sessionDir = join(dataDir, req.params.sessionId);
    if (!existsSync(sessionDir)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const files = listFilesRecursive(sessionDir, '');
    res.json(files);
  });

  // Read file — path passed as query param ?path=guidance.md
  router.get('/:sessionId/file', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ error: 'path query param required' });
      return;
    }
    const svc = getFileService(req.params.sessionId);
    if (!svc) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    try {
      const result = svc.readFile({ path: filePath });
      res.json(result);
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  });

  // Create / update file — path in body
  router.put('/:sessionId/file', (req, res) => {
    const svc = getFileService(req.params.sessionId);
    if (!svc) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const { path: filePath, content, startLine, endLine } = req.body;
    if (!filePath || content === undefined) {
      res.status(400).json({ error: 'path and content required' });
      return;
    }
    try {
      svc.writeFile({ path: filePath, content, startLine, endLine });
      res.json({ success: true, path: filePath });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Delete file — path as query param
  router.delete('/:sessionId/file', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ error: 'path query param required' });
      return;
    }
    const sessionDir = join(dataDir, req.params.sessionId);
    const fullPath = join(sessionDir, filePath);
    if (!existsSync(fullPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    try {
      unlinkSync(fullPath);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Global profile
  router.get('/profile', (_req, res) => {
    const profilePath = join(dataDir, 'profile.md');
    if (!existsSync(profilePath)) {
      res.json({ content: '', totalLines: 0 });
      return;
    }
    const svc = new FileService(dataDir);
    const result = svc.readFile({ path: 'profile.md' });
    res.json(result);
  });

  router.put('/profile', (req, res) => {
    const { content } = req.body;
    const svc = new FileService(dataDir);
    svc.writeFile({ path: 'profile.md', content });
    res.json({ success: true });
  });

  // Global system prompt
  router.get('/system-prompt', (_req, res) => {
    const defaultContent = getDefaultSystemPrompt();
    const promptPath = join(dataDir, 'system-prompt.md');
    if (!existsSync(promptPath)) {
      res.json({ content: '', totalLines: 0, defaultContent });
      return;
    }
    const svc = new FileService(dataDir);
    const result = svc.readFile({ path: 'system-prompt.md' });
    res.json({ ...result, defaultContent });
  });

  router.put('/system-prompt', (req, res) => {
    const { content } = req.body;
    const svc = new FileService(dataDir);
    svc.writeFile({ path: 'system-prompt.md', content });
    res.json({ success: true });
  });

  // LLM status (read-only, no apiKey exposed)
  router.get('/llm-status', (_req, res) => {
    const config = loadLLMConfig(dataDir);
    res.json({
      configured: isLLMConfigured(config),
      provider: config.provider,
      model: config.model,
      baseURL: config.baseURL,
    });
  });

  // Update LLM config (partial merge)
  router.put('/llm-config', (req, res) => {
    const { provider, apiKey, baseURL, model } = req.body;
    const config = saveLLMConfig(dataDir, { provider, apiKey, baseURL, model });
    res.json({
      configured: isLLMConfigured(config),
      provider: config.provider,
      model: config.model,
      baseURL: config.baseURL,
    });
  });

  return router;
}

function listFilesRecursive(baseDir: string, relDir: string): string[] {
  const dir = join(baseDir, relDir);
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(baseDir, relPath));
    } else if (entry.name !== 'messages.json' && !entry.name.startsWith('.')) {
      files.push(relPath);
    }
  }
  return files;
}
