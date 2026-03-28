import express from 'express';
import { searchSearXNG } from '../services/searchProviders/searxng.js';

interface SearchRequest {
  query: string;
  maxResults: number;
  category: string;
  engines?: string[];
  timeRange?: 'day' | 'month' | 'year';
  timeoutMs: number;
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    mode: process.env.SEARCH_RUNTIME_MODE ?? 'local',
  });
});

app.post('/search', async (req, res) => {
  const input = req.body as SearchRequest;
  const backendURL = process.env.SEARCH_BACKEND_URL;
  const mode = process.env.SEARCH_RUNTIME_MODE ?? 'local';
  const externalBaseURL = process.env.SEARCH_EXTERNAL_BASE_URL;

  if (!input.query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  try {
    if (mode === 'local') {
      if (!backendURL) {
        res.status(400).json({ error: 'SEARCH_BACKEND_URL is required in local mode' });
        return;
      }

      const response = await fetch(`${backendURL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(input.timeoutMs + 1000),
        body: JSON.stringify(input),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error || `Backend search failed with status ${response.status}`);
      }

      res.json(payload);
      return;
    }

    if (!externalBaseURL) {
      res.status(400).json({ error: 'SEARCH_EXTERNAL_BASE_URL is required in external mode' });
      return;
    }

    const payload = await searchSearXNG({
      query: input.query,
      category: input.category,
      engines: input.engines,
      timeRange: input.timeRange,
      timeoutMs: input.timeoutMs,
      baseURL: externalBaseURL,
    });

    const results = (payload.results ?? [])
      .filter((item) => item.url && item.title)
      .slice(0, input.maxResults)
      .map((item) => ({
        title: item.title!,
        url: item.url!,
        snippet: item.content ?? '',
        source: item.engine ?? 'searxng',
        publishedAt: item.publishedDate,
      }));

    res.json({
      provider: 'searxng',
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: message });
  }
});

const port = Number(process.env.SEARCH_SIDECAR_PORT ?? 18080);
app.listen(port, () => {
  console.log(`Search sidecar listening on ${port}`);
});
