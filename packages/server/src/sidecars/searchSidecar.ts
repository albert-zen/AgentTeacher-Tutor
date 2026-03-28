import express from 'express';

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
  res.json({ ok: true });
});

app.post('/search', async (req, res) => {
  const input = req.body as SearchRequest;
  const backendURL = process.env.SEARCH_BACKEND_URL;
  if (!input.query || !backendURL) {
    res.status(400).json({ error: 'query and SEARCH_BACKEND_URL are required' });
    return;
  }

  try {
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: message });
  }
});

const port = Number(process.env.SEARCH_SIDECAR_PORT ?? 18080);
app.listen(port, () => {
  console.log(`Search sidecar listening on ${port}`);
});
