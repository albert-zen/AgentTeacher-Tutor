import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUrl } from '../src/services/fetchUrlService.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchUrlService', () => {
  it('extracts readable content from html pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null),
        },
        text: async () =>
          `
            <html>
              <head>
                <title>OpenClaw Guide</title>
                <meta name="description" content="A concise guide" />
              </head>
              <body>
                <main>
                  <h1>OpenClaw</h1>
                  <p>OpenClaw helps automate multi-step tasks.</p>
                </main>
              </body>
            </html>
          `,
      }),
    );

    const result = await fetchUrl({ url: 'https://example.com/openclaw' });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe('OpenClaw Guide');
    expect(result.data?.description).toBe('A concise guide');
    expect(result.data?.content).toContain('OpenClaw helps automate multi-step tasks.');
  });

  it('rejects unsupported protocols', async () => {
    const result = await fetchUrl({ url: 'file:///etc/passwd' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Only http and https URLs are supported');
  });
});
