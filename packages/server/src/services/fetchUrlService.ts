export interface FetchUrlInput {
  url: string;
  maxChars?: number;
}

export interface FetchUrlSuccess {
  success: true;
  data: {
    url: string;
    title?: string;
    description?: string;
    contentType: string;
    content: string;
    truncated: boolean;
    fetchedAt: string;
  };
}

export interface FetchUrlFailure {
  success: false;
  error: string;
}

export type FetchUrlResult = FetchUrlSuccess | FetchUrlFailure;

const DEFAULT_MAX_CHARS = 12000;

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

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stripTags(html: string) {
  return normalizeWhitespace(decodeHtmlEntities(html.replace(/<[^>]*>/g, ' ')));
}

function extractTagContent(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : undefined;
}

function extractHtmlContent(html: string) {
  const sanitized = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  const title = extractTagContent(sanitized, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    extractTagContent(sanitized, /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ??
    extractTagContent(sanitized, /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i);

  const mainHtml =
    sanitized.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    sanitized.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    sanitized.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    sanitized;

  const content = stripTags(mainHtml);

  return {
    title,
    description,
    content,
  };
}

function truncate(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return { value: text, truncated: false };
  }
  return {
    value: `${text.slice(0, maxChars).trimEnd()}\n\n[truncated]`,
    truncated: true,
  };
}

export async function fetchUrl(input: FetchUrlInput): Promise<FetchUrlResult> {
  const maxChars = Math.max(1000, Math.min(input.maxChars ?? DEFAULT_MAX_CHARS, 40000));

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { success: false, error: 'Invalid URL.' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { success: false, error: 'Only http and https URLs are supported.' };
  }

  try {
    const response = await fetch(parsed, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TeacherAgent/1.0; +https://example.local)',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { success: false, error: `Fetch failed with status ${response.status}.` };
    }

    const contentType = response.headers.get('content-type') ?? 'text/plain';
    const body = await response.text();

    const extracted = contentType.includes('html')
      ? extractHtmlContent(body)
      : {
          title: undefined,
          description: undefined,
          content: normalizeWhitespace(body),
        };

    if (!extracted.content) {
      return { success: false, error: 'No readable content could be extracted from the URL.' };
    }

    const { value, truncated } = truncate(extracted.content, maxChars);
    return {
      success: true,
      data: {
        url: parsed.toString(),
        title: extracted.title,
        description: extracted.description,
        contentType,
        content: value,
        truncated,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (error: unknown) {
    const causeCode =
      error instanceof Error && error.cause && typeof error.cause === 'object' && 'code' in error.cause
        ? (error.cause as { code?: string }).code
        : undefined;
    const suffix = causeCode ? ` (${causeCode})` : error instanceof Error ? `: ${error.message}` : '';
    return {
      success: false,
      error: `Unable to fetch ${parsed.toString()}${suffix}`,
    };
  }
}
