import express from 'express';
import { searchDuckDuckGo } from '../services/searchProviders/duckduckgo.js';

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
    listening: true,
    provider: process.env.SEARCH_LOCAL_PROVIDER ?? 'duckduckgo',
  });
});

app.post('/search', async (req, res) => {
  const input = req.body as SearchRequest;
  if (!input.query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  try {
    const results = await searchDuckDuckGo({
      query: input.query,
      maxResults: input.maxResults,
      timeoutMs: input.timeoutMs,
    });
    res.json({
      provider: 'duckduckgo',
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
