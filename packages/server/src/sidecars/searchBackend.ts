import express from 'express';

interface SearchRequest {
  query: string;
  maxResults: number;
  category: string;
  engines?: string[];
  timeRange?: 'day' | 'month' | 'year';
  timeoutMs: number;
}

interface SearXNGSearchResult {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
  publishedDate?: string;
}

interface SearXNGSearchResponse {
  results?: SearXNGSearchResult[];
}

function normalizeResults(items: SearXNGSearchResult[], maxResults: number) {
  const seen = new Set<string>();
  const results: Array<{
    title: string;
    url: string;
    snippet: string;
    source: string;
    publishedAt?: string;
  }> = [];

  for (const item of items) {
    if (!item.url || !item.title) continue;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    results.push({
      title: item.title,
      url: item.url,
      snippet: item.content ?? '',
      source: item.engine ?? 'unknown',
      publishedAt: item.publishedDate,
    });
    if (results.length >= maxResults) break;
  }

  return results;
}

async function searchRemoteSearXNG(input: SearchRequest) {
  const baseURL = process.env.SEARCH_REMOTE_BASE_URL;
  if (!baseURL) throw new Error('SEARCH_REMOTE_BASE_URL is not configured.');

  const url = new URL('/search', baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
  url.searchParams.set('q', input.query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('categories', input.category);
  if (input.engines && input.engines.length > 0) {
    url.searchParams.set('engines', input.engines.join(','));
  }
  if (input.timeRange) {
    url.searchParams.set('time_range', input.timeRange);
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(input.timeoutMs) });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Remote search failed with status ${response.status}${body ? `: ${body}` : ''}`);
  }

  const payload = (await response.json()) as SearXNGSearchResponse;
  return normalizeResults(payload.results ?? [], input.maxResults);
}

const app = express();
app.use(express.json());

app.get('/health', async (_req, res) => {
  const baseURL = process.env.SEARCH_REMOTE_BASE_URL;
  if (!baseURL) {
    res.status(200).json({
      ok: true,
      listening: true,
      upstreamReachable: false,
      error: 'SEARCH_REMOTE_BASE_URL is not configured.',
    });
    return;
  }

  try {
    const response = await fetch(baseURL, { signal: AbortSignal.timeout(1500) });
    res.status(200).json({
      ok: true,
      listening: true,
      upstreamReachable: response.ok,
      remoteBaseURL: baseURL,
      status: response.status,
    });
  } catch (error: unknown) {
    res.status(200).json({
      ok: true,
      listening: true,
      upstreamReachable: false,
      remoteBaseURL: baseURL,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/search', async (req, res) => {
  const input = req.body as SearchRequest;
  if (!input.query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  try {
    const results = await searchRemoteSearXNG(input);
    res.json({
      provider: 'searxng',
      results,
    });
  } catch (error: unknown) {
    res.status(502).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

const port = Number(process.env.SEARCH_BACKEND_PORT ?? 18081);
app.listen(port, () => {
  console.log(`Search backend listening on ${port}`);
});
