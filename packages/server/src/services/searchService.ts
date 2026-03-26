import { loadSearchConfig } from './searchConfig.js';
import {
  searchSearXNG,
  type SearXNGSearchResult,
} from './searchProviders/searxng.js';

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
    provider: 'searxng';
    results: WebSearchItem[];
  };
}

export interface WebSearchFailure {
  success: false;
  error: string;
}

export type WebSearchResult = WebSearchSuccess | WebSearchFailure;

function normalizeItems(items: SearXNGSearchResult[], maxResults: number): WebSearchItem[] {
  const seen = new Set<string>();
  const normalized: WebSearchItem[] = [];

  for (const item of items) {
    if (!item.url || !item.title) continue;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    normalized.push({
      title: item.title,
      url: item.url,
      snippet: item.content ?? '',
      source: item.engine ?? 'unknown',
      publishedAt: item.publishedDate,
    });
    if (normalized.length >= maxResults) break;
  }

  return normalized;
}

export async function searchWeb(dataDir: string, sessionId: string, input: WebSearchInput): Promise<WebSearchResult> {
  const config = loadSearchConfig(dataDir, sessionId);
  if (!config.enabled) {
    return { success: false, error: 'Web search is disabled for this session.' };
  }

  const category = input.category ?? 'general';
  if (config.allowedCategories.length > 0 && !config.allowedCategories.includes(category)) {
    return { success: false, error: `Search category "${category}" is not allowed.` };
  }

  const engines = input.engines?.filter((engine) =>
    config.allowedEngines.length > 0 ? config.allowedEngines.includes(engine) : true,
  );
  if (input.engines && input.engines.length > 0 && (!engines || engines.length === 0)) {
    return { success: false, error: 'No requested search engines are allowed.' };
  }
  const maxResults = Math.max(1, Math.min(input.maxResults ?? config.defaultMaxResults, 10));

  try {
    const payload = await searchSearXNG({
      query: input.query,
      category,
      engines,
      timeRange: input.timeRange,
      timeoutMs: config.timeoutMs,
      baseURL: config.baseURL,
    });
    const results = normalizeItems(payload.results ?? [], maxResults);
    return {
      success: true,
      data: {
        query: input.query,
        provider: 'searxng',
        results,
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
