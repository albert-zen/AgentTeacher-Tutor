import { Router } from 'express';
import { join } from 'path';
import { readdirSync, existsSync } from 'fs';
import { FileService } from '../services/fileService.js';
import { parseProfileBlocks } from '../services/profileParser.js';
import type { Store } from '../db/index.js';
import {
  isLLMConfigured,
  getSystemPrompt as getDefaultSystemPrompt,
  loadLLMConfig,
  saveLLMConfig,
} from '../services/llm.js';
import { resolveToolContext, runToolRuntimeAction, setDraftToolEnabled, setSessionToolEnabled, updateGlobalToolState } from '../services/toolManager.js';
import type { ToolId } from '../services/toolDefinitions.js';
import { buildTemplateContextPreview } from '../services/contextPreview.js';
import { loadSessionContext, loadSessionDraft, saveSessionDraft, type SessionDraft } from '../services/sessionDraftService.js';
import { loadToolConfig } from '../services/toolConfig.js';
import { getToolRuntimeManager } from '../services/toolRuntimeManager.js';

export function createFilesRouter(store: Store, dataDir: string) {
  const router = Router();

  async function ensureAutoManagedRuntimes() {
    const toolConfig = loadToolConfig(dataDir);
    const webSearchConfig = toolConfig.tools.web_search;
    if (webSearchConfig.runtimeMode !== 'local') {
      return;
    }

    const draftEnabled = loadSessionDraft(dataDir).manifest.enabledTools.includes('web_search');
    const sessionEnabled = store.getSessions().some((session) => loadSessionContext(dataDir, session.id).enabledTools.includes('web_search'));
    if (!draftEnabled && !sessionEnabled) {
      return;
    }

    await getToolRuntimeManager(dataDir).ensureReady('web_search', webSearchConfig);
  }

  function getFileService(sessionId: string): FileService | null {
    const session = store.getSession(sessionId);
    if (!session) return null;
    return new FileService(join(dataDir, sessionId));
  }

  // Profile blocks
  router.get('/profile/blocks', (_req, res) => {
    const profilePath = join(dataDir, 'profile.md');
    if (!existsSync(profilePath)) {
      res.json([]);
      return;
    }
    const svc = new FileService(dataDir);
    const { content } = svc.readFile({ path: 'profile.md' });
    res.json(parseProfileBlocks(content));
  });

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  // Delete file — path as query param
  router.delete('/:sessionId/file', (req, res) => {
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
      svc.deleteFile(filePath);
      res.json({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg === 'File not found' ? 404 : 400;
      res.status(status).json({ error: msg });
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

  router.get('/session-draft', (_req, res) => {
    res.json(loadSessionDraft(dataDir));
  });

  router.put('/session-draft', (req, res) => {
    const body = req.body as SessionDraft;
    res.json(saveSessionDraft(dataDir, body));
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

  router.get('/tools', async (_req, res) => {
    await ensureAutoManagedRuntimes();
    const context = resolveToolContext(dataDir);
    res.json({
      tools: context.visibleTools,
      globalConfig: context.globalConfig,
      manifest: context.source.kind === 'draft' ? context.source.draft.manifest : null,
    });
  });

  router.get('/context-preview/template', (_req, res) => {
    res.json(buildTemplateContextPreview(dataDir));
  });

  router.put('/tools/:id', async (req, res) => {
    const toolId = req.params.id as ToolId;
    try {
      const { enabled, ...patch } = req.body ?? {};
      if (typeof enabled === 'boolean') {
        setDraftToolEnabled(dataDir, toolId, enabled);
      }
      await updateGlobalToolState(dataDir, toolId, patch);
      await ensureAutoManagedRuntimes();
      const refreshed = resolveToolContext(dataDir);
      res.json({
        tools: refreshed.visibleTools,
        globalConfig: refreshed.globalConfig,
        manifest: refreshed.source.kind === 'draft' ? refreshed.source.draft.manifest : null,
      });
    } catch (error: unknown) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/tools/:id/runtime/:action', async (req, res) => {
    const toolId = req.params.id as ToolId;
    const action = req.params.action as 'start' | 'stop' | 'restart' | 'check';
    try {
      const tool = await runToolRuntimeAction(dataDir, toolId, action);
      res.json(tool);
    } catch (error: unknown) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/session/:id/tools', async (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    await ensureAutoManagedRuntimes();
    const context = resolveToolContext(dataDir, session.id);
    res.json({
      tools: context.visibleTools,
      sessionConfig: loadSessionContext(dataDir, session.id),
      globalConfig: context.globalConfig,
    });
  });

  router.put('/session/:id/tools', async (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { toolId, enabled } = req.body as { toolId?: ToolId; enabled?: boolean };
    if (!toolId) {
      res.status(400).json({ error: 'toolId is required' });
      return;
    }

    try {
      const desiredEnabled = enabled === undefined ? true : Boolean(enabled);
      setSessionToolEnabled(dataDir, session.id, toolId, desiredEnabled);
      await ensureAutoManagedRuntimes();
      const next = resolveToolContext(dataDir, session.id);
      res.json({
        tools: next.visibleTools,
        sessionConfig: loadSessionContext(dataDir, session.id),
        globalConfig: next.globalConfig,
      });
    } catch (error: unknown) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
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

  // Update LLM config (partial merge — only defined fields are applied)
  router.put('/llm-config', (req, res) => {
    const { provider, apiKey, baseURL, model } = req.body;
    const partial: Record<string, string> = {};
    if (provider !== undefined) partial.provider = provider;
    if (apiKey !== undefined) partial.apiKey = apiKey;
    if (baseURL !== undefined) partial.baseURL = baseURL;
    if (model !== undefined) partial.model = model;
    const config = saveLLMConfig(dataDir, partial);
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
