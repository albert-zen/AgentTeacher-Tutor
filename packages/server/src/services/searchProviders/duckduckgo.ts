export interface DuckDuckGoSearchRequest {
  query: string;
  maxResults: number;
  timeoutMs: number;
}

export interface DuckDuckGoSearchItem {
  title: string;
  url: string;
  snippet: string;
  source: 'duckduckgo';
}

const DUCKDUCKGO_HTML_URL = 'https://html.duckduckgo.com/html/';

function decodeHtmlEntities(text: string) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
    const named: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' ',
    };

    const lower = entity.toLowerCase();
    if (named[lower]) return named[lower];
    if (lower === '#39') return "'";

    if (lower.startsWith('#x')) {
      const value = Number.parseInt(lower.slice(2), 16);
      return Number.isNaN(value) ? `&${entity};` : String.fromCodePoint(value);
    }

    if (lower.startsWith('#')) {
      const value = Number.parseInt(lower.slice(1), 10);
      return Number.isNaN(value) ? `&${entity};` : String.fromCodePoint(value);
    }

    return `&${entity};`;
  });
}

function stripTags(text: string) {
  return decodeHtmlEntities(text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function resolveDuckDuckGoUrl(rawHref: string) {
  const decoded = decodeHtmlEntities(rawHref);
  const absolute = decoded.startsWith('//')
    ? `https:${decoded}`
    : decoded.startsWith('/')
      ? new URL(decoded, 'https://duckduckgo.com').toString()
      : decoded;

  try {
    const parsed = new URL(absolute);
    const redirected = parsed.searchParams.get('uddg');
    return redirected ? decodeURIComponent(redirected) : absolute;
  } catch {
    return absolute;
  }
}

function extractResultBlocks(html: string) {
  const blocks = html.split(/<div[^>]*class="[^"]*results_links[^"]*"[^>]*>/i).slice(1);
  if (blocks.length > 0) return blocks;

  const anchorMatches = html.match(/<a[^>]*class="[^"]*result__a[^"]*"[\s\S]*?<\/a>/gi) ?? [];
  return anchorMatches.map((match) => match);
}

export async function searchDuckDuckGo({
  query,
  maxResults,
  timeoutMs,
}: DuckDuckGoSearchRequest): Promise<DuckDuckGoSearchItem[]> {
  const url = new URL(DUCKDUCKGO_HTML_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('kl', 'wt-wt');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TeacherAgent/1.0; +https://example.local)',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`DuckDuckGo request failed with status ${response.status}${body ? `: ${body}` : ''}`);
  }

  const html = await response.text();
  const blocks = extractResultBlocks(html);
  const results: DuckDuckGoSearchItem[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const anchorMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchorMatch) continue;

    const url = resolveDuckDuckGoUrl(anchorMatch[1]);
    if (!url || seen.has(url)) continue;

    const title = stripTags(anchorMatch[2]);
    if (!title) continue;

    const snippetMatch =
      block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ??
      block.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    seen.add(url);
    results.push({
      title,
      url,
      snippet: snippetMatch ? stripTags(snippetMatch[1]) : '',
      source: 'duckduckgo',
    });

    if (results.length >= maxResults) break;
  }

  return results;
}
