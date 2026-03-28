import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { FileService } from './fileService.js';
import { fetchUrl } from './fetchUrlService.js';
import { searchWeb } from './searchService.js';

export type ToolId = 'read_file' | 'write_file' | 'fetch_url' | 'web_search' | 'browser';
export type ToolRuntimeMode = 'builtin' | 'local' | 'managed' | 'external';
export type ToolRuntimeStatus = 'disabled' | 'stopped' | 'starting' | 'ready' | 'error';

export interface ToolExecutionContext {
  fileService: FileService;
  dataDir: string;
  sessionId: string;
}

export interface ToolRegistryEntry {
  id: ToolId;
  label: string;
  description: string;
  uiVisible: boolean;
  exposeToModel: boolean;
  runtime: 'builtin' | 'managed';
  buildPromptFragment(): string;
  buildSchema(ctx: ToolExecutionContext): ToolSet[string];
}

const registry: Record<ToolId, ToolRegistryEntry> = {
  read_file: {
    id: 'read_file',
    label: '读文件',
    description: '读取当前 Session 工作区中的文件或行范围。',
    uiVisible: true,
    exposeToModel: true,
    runtime: 'builtin',
    buildPromptFragment: () =>
      [
        '## read_file',
        '- Use read_file to inspect files or line ranges inside the current session workspace.',
        '- Prefer read_file when the student references a file or when you need to verify current file contents before answering.',
      ].join('\n'),
    buildSchema: ({ fileService }) =>
      tool({
        description: 'Read a file or specific line range from the session workspace.',
        inputSchema: z.object({
          path: z.string().describe('Relative file path'),
          startLine: z.number().optional().describe('Start line (1-based)'),
          endLine: z.number().optional().describe('End line (1-based, inclusive)'),
        }),
        execute: async (args: { path: string; startLine?: number; endLine?: number }) => {
          try {
            const data = fileService.readFile(args);
            return { success: true, data };
          } catch (err: unknown) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
          }
        },
      }),
  },
  write_file: {
    id: 'write_file',
    label: '写文件',
    description: '创建或修改当前 Session 工作区中的文件内容。',
    uiVisible: true,
    exposeToModel: true,
    runtime: 'builtin',
    buildPromptFragment: () =>
      [
        '## write_file',
        '- Use write_file to create or update learning materials inside the current session workspace.',
        '- Only modify files that help the student, and keep edits aligned with the current session context.',
      ].join('\n'),
    buildSchema: ({ fileService }) =>
      tool({
        description:
          'Create or update a file. Without line numbers: full write. With line numbers: replace specified lines.',
        inputSchema: z.object({
          path: z.string().describe('Relative file path'),
          content: z.string().describe('Content to write'),
          startLine: z.number().optional().describe('Start line for partial replace (1-based)'),
          endLine: z.number().optional().describe('End line for partial replace (1-based, inclusive)'),
        }),
        execute: async (args: { path: string; content: string; startLine?: number; endLine?: number }) => {
          try {
            fileService.writeFile(args);
            return { success: true, data: { path: args.path, written: true } };
          } catch (err: unknown) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
          }
        },
      }),
  },
  fetch_url: {
    id: 'fetch_url',
    label: '抓取网页',
    description: '抓取指定 URL 的正文内容，供 Teacher 阅读和引用。',
    uiVisible: true,
    exposeToModel: true,
    runtime: 'builtin',
    buildPromptFragment: () =>
      [
        '## fetch_url',
        '- Use fetch_url to read the content of a specific webpage after you already have a relevant URL.',
        '- Prefer fetching one or two promising pages instead of pulling many URLs at once.',
        '- Summarize and cite fetched pages carefully; if a page is useful for later, persist notes with write_file instead of repeatedly fetching it.',
      ].join('\n'),
    buildSchema: () =>
      tool({
        description: 'Fetch and extract the readable content of a webpage URL.',
        inputSchema: z.object({
          url: z.string().url().describe('HTTP or HTTPS URL to fetch'),
          maxChars: z
            .number()
            .int()
            .positive()
            .max(40000)
            .optional()
            .describe('Optional maximum number of characters to keep'),
        }),
        execute: async (args: { url: string; maxChars?: number }) => fetchUrl(args),
      }),
  },
  web_search: {
    id: 'web_search',
    label: '联网搜索',
    description: '为 Teacher 提供外部资料与最新信息检索能力。',
    uiVisible: true,
    exposeToModel: true,
    runtime: 'managed',
    buildPromptFragment: () =>
      [
        '## web_search',
        '- Use web_search only for up-to-date information, external references, or official documentation.',
        '- Prefer a small number of high-quality search results and mention sources when they inform your answer.',
        '- If search results will be useful later in the session, you may persist them into references/ using write_file.',
      ].join('\n'),
    buildSchema: ({ dataDir, sessionId }) =>
      tool({
        description: 'Search the web for up-to-date information and source links.',
        inputSchema: z.object({
          query: z.string().describe('Search query'),
          maxResults: z.number().int().positive().max(10).optional().describe('Maximum number of results to return'),
          category: z.string().optional().describe('Search category, such as general, news, it, or science'),
          engines: z.array(z.string()).optional().describe('Optional list of search engines to use in external mode'),
          timeRange: z
            .enum(['day', 'month', 'year'])
            .optional()
            .describe('Optional recency window for time-sensitive queries'),
        }),
        execute: async (args: {
          query: string;
          maxResults?: number;
          category?: string;
          engines?: string[];
          timeRange?: 'day' | 'month' | 'year';
        }) => searchWeb(dataDir, sessionId, args),
      }),
  },
  browser: {
    id: 'browser',
    label: '浏览器',
    description: '预留给未来网页浏览与抓取能力的工具定义。',
    uiVisible: false,
    exposeToModel: false,
    runtime: 'managed',
    buildPromptFragment: () =>
      ['## browser', '- This tool is reserved for future browser automation support and is not currently exposed.'].join(
        '\n',
      ),
    buildSchema: () =>
      tool({
        description: 'Reserved browser tool.',
        inputSchema: z.object({}),
        execute: async () => ({ success: false, error: 'Browser tool is not implemented yet.' }),
      }),
  },
};

export function getToolRegistry(): Record<ToolId, ToolRegistryEntry> {
  return registry;
}

export function getVisibleRegistryEntries() {
  return Object.values(registry).filter((entry) => entry.uiVisible);
}
