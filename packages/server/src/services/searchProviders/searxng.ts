import type { SearchConfig } from '../searchConfig.js';

export interface SearXNGSearchResult {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
  publishedDate?: string;
}

export interface SearXNGSearchResponse {
  results?: SearXNGSearchResult[];
}

export interface SearXNGSearchRequest {
  query: string;
  category: string;
  engines?: string[];
  timeRange?: 'day' | 'month' | 'year';
  timeoutMs: number;
  baseURL: string;
}

export async function searchSearXNG({
  query,
  category,
  engines,
  timeRange,
  timeoutMs,
  baseURL,
}: SearXNGSearchRequest): Promise<SearXNGSearchResponse> {
  const url = new URL('/search', baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('categories', category);
  if (engines && engines.length > 0) {
    url.searchParams.set('engines', engines.join(','));
  }
  if (timeRange) {
    url.searchParams.set('time_range', timeRange);
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`SearXNG request failed with status ${response.status}${body ? `: ${body}` : ''}`);
  }

  return (await response.json()) as SearXNGSearchResponse;
}

export function isSearXNGProvider(config: SearchConfig): config is SearchConfig & { provider: 'searxng' } {
  return config.provider === 'searxng';
}
