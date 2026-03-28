import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export type ToolId = 'read_file' | 'write_file' | 'web_search' | 'browser';
export type ToolRuntimeMode = 'builtin' | 'managed' | 'external';
export type ToolRuntimeStatus = 'disabled' | 'stopped' | 'starting' | 'ready' | 'error';

export interface ToolDefinition {
  id: ToolId;
  label: string;
  description: string;
  exposeToModel: boolean;
  uiVisible: boolean;
  hasRuntime: boolean;
  supportedRuntimeModes: ToolRuntimeMode[];
}

interface ToolDefinitionFile {
  id: ToolId;
  label: string;
  description: string;
  exposeToModel: boolean;
  uiVisible: boolean;
  hasRuntime: boolean;
  supportedRuntimeModes: ToolRuntimeMode[];
}

const defaultDefinitionFiles: Record<ToolId, ToolDefinitionFile> = {
  read_file: {
    id: 'read_file',
    label: '读文件',
    description: '读取当前 Session 工作区中的文件或行范围。',
    exposeToModel: true,
    uiVisible: true,
    hasRuntime: false,
    supportedRuntimeModes: ['builtin'],
  },
  write_file: {
    id: 'write_file',
    label: '写文件',
    description: '创建或修改当前 Session 工作区中的文件内容。',
    exposeToModel: true,
    uiVisible: true,
    hasRuntime: false,
    supportedRuntimeModes: ['builtin'],
  },
  web_search: {
    id: 'web_search',
    label: '联网搜索',
    description: '为 Teacher 提供外部资料与最新信息检索能力。',
    exposeToModel: true,
    uiVisible: true,
    hasRuntime: true,
    supportedRuntimeModes: ['managed', 'external'],
  },
  browser: {
    id: 'browser',
    label: '浏览器',
    description: '预留给未来网页浏览与抓取能力的工具定义。',
    exposeToModel: false,
    uiVisible: false,
    hasRuntime: true,
    supportedRuntimeModes: ['managed', 'external'],
  },
};

const defaultPromptFragments: Record<ToolId, string> = {
  read_file: [
    '## read_file',
    '- Use read_file to inspect files or line ranges inside the current session workspace.',
    '- Prefer read_file when the student references a file or when you need to verify current file contents before answering.',
  ].join('\n'),
  write_file: [
    '## write_file',
    '- Use write_file to create or update learning materials inside the current session workspace.',
    '- Only modify files that help the student, and keep edits aligned with the current session context.',
  ].join('\n'),
  web_search: [
    '## web_search',
    '- Use web_search only for up-to-date information, external references, or official documentation.',
    '- Prefer a small number of high-quality search results and mention sources when they inform your answer.',
    '- If search results will be useful later in the session, you may persist them into references/ using write_file.',
  ].join('\n'),
  browser: [
    '## browser',
    '- This tool is reserved for future browser automation support and is not currently exposed.',
  ].join('\n'),
};

function toolDir(dataDir: string) {
  return join(dataDir, 'tools');
}

function toolDefinitionPath(dataDir: string, toolId: ToolId) {
  return join(toolDir(dataDir), `${toolId}.json`);
}

function toolPromptPath(dataDir: string, toolId: ToolId) {
  return join(toolDir(dataDir), `${toolId}.md`);
}

export function ensureToolDefinitionFiles(dataDir: string) {
  mkdirSync(toolDir(dataDir), { recursive: true });

  for (const toolId of Object.keys(defaultDefinitionFiles) as ToolId[]) {
    const definitionPath = toolDefinitionPath(dataDir, toolId);
    if (!existsSync(definitionPath)) {
      writeFileSync(definitionPath, JSON.stringify(defaultDefinitionFiles[toolId], null, 2));
    }

    const promptPath = toolPromptPath(dataDir, toolId);
    if (!existsSync(promptPath)) {
      writeFileSync(promptPath, `${defaultPromptFragments[toolId]}\n`);
    }
  }
}

export function loadToolDefinitions(dataDir: string): Record<ToolId, ToolDefinition> {
  ensureToolDefinitionFiles(dataDir);

  const definitions = {} as Record<ToolId, ToolDefinition>;
  for (const toolId of Object.keys(defaultDefinitionFiles) as ToolId[]) {
    const fallback = defaultDefinitionFiles[toolId];
    let parsed: Partial<ToolDefinitionFile> = {};
    try {
      parsed = JSON.parse(readFileSync(toolDefinitionPath(dataDir, toolId), 'utf-8')) as Partial<ToolDefinitionFile>;
    } catch {
      parsed = {};
    }
    definitions[toolId] = {
      id: toolId,
      label: parsed.label || fallback.label,
      description: parsed.description || fallback.description,
      exposeToModel: parsed.exposeToModel ?? fallback.exposeToModel,
      uiVisible: parsed.uiVisible ?? fallback.uiVisible,
      hasRuntime: parsed.hasRuntime ?? fallback.hasRuntime,
      supportedRuntimeModes: parsed.supportedRuntimeModes ?? fallback.supportedRuntimeModes,
    };
  }
  return definitions;
}

export function loadToolPromptFragment(dataDir: string, toolId: ToolId): string {
  ensureToolDefinitionFiles(dataDir);
  try {
    return readFileSync(toolPromptPath(dataDir, toolId), 'utf-8').trim();
  } catch {
    return defaultPromptFragments[toolId];
  }
}
