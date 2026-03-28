import { getToolRuntimeManager } from './toolRuntimeManager.js';
import { resolveToolContext } from './toolManager.js';
import type { WebSearchToolSettings } from './toolConfig.js';

export interface WebSearchInput {
  query: string;
  maxResults?: number;
  category?: string;
  engines?: string[];
  timeRange?: 'day' | 'month' | 'year';
}

export interface WebSearchItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
}

export interface WebSearchSuccess {
  success: true;
  data: {
    query: string;
    provider: 'searxng' | 'duckduckgo';
    results: WebSearchItem[];
  };
}

export interface WebSearchFailure {
  success: false;
  error: string;
}

export type WebSearchResult = WebSearchSuccess | WebSearchFailure;

interface SidecarSearchResponse {
  provider: 'searxng' | 'duckduckgo';
  results: WebSearchItem[];
  error?: string;
}

function validateInput(config: WebSearchToolSettings, input: WebSearchInput) {
  const category = input.category ?? 'general';
  if (config.allowedCategories.length > 0 && !config.allowedCategories.includes(category)) {
    return { error: `Search category "${category}" is not allowed.` };
  }

  if (config.runtimeMode === 'local' && input.engines && input.engines.length > 0) {
    return { error: 'Local search mode does not support custom engines.' };
  }

  const engines = input.engines?.filter((engine) =>
    config.allowedEngines.length > 0 ? config.allowedEngines.includes(engine) : true,
  );
  if (input.engines && input.engines.length > 0 && (!engines || engines.length === 0)) {
    return { error: 'No requested search engines are allowed.' };
  }

  return {
    category,
    engines,
    maxResults: Math.max(1, Math.min(input.maxResults ?? config.defaultMaxResults, 10)),
  };
}

async function callSidecar(config: WebSearchToolSettings, input: WebSearchInput, validated: { category: string; engines?: string[]; maxResults: number }) {
  const response = await fetch(`http://127.0.0.1:${config.sidecar.port}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(config.timeoutMs + 1000),
    body: JSON.stringify({
      query: input.query,
      maxResults: validated.maxResults,
      category: validated.category,
      engines: validated.engines,
      timeRange: input.timeRange,
      timeoutMs: config.timeoutMs,
    }),
  });

  const payload = (await response.json().catch(() => null)) as SidecarSearchResponse | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || `Sidecar search failed with status ${response.status}.`);
  }

  return payload as SidecarSearchResponse;
}

export async function searchWeb(dataDir: string, sessionId: string, input: WebSearchInput): Promise<WebSearchResult> {
  const toolContext = resolveToolContext(dataDir, sessionId);
  const tool = toolContext.visibleTools.find((item) => item.id === 'web_search');
  if (!tool || !tool.enabled) {
    return { success: false, error: 'Web search is disabled for this session.' };
  }

  const config = tool.config as WebSearchToolSettings;
  const validated = validateInput(config, input);
  if ('error' in validated) {
    return { success: false, error: validated.error ?? 'Invalid web search input.' };
  }

  try {
    const runtimeManager = getToolRuntimeManager(dataDir);
    const snapshot = await runtimeManager.ensureReady('web_search', config);
    if (snapshot.status !== 'ready') {
      return {
        success: false,
        error: snapshot.message || 'Web search runtime is not ready.',
      };
    }

    const payload = await callSidecar(config, input, validated);

    return {
      success: true,
      data: {
        query: input.query,
        provider: payload.provider,
        results: payload.results,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
    };
  }
}
