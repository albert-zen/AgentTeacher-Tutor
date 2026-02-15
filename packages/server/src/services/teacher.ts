import type { FileService } from './fileService.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface ToolCallResult {
  success: boolean;
  data?: any;
  error?: string;
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'read_file',
      description: 'Read a file or specific line range from the session workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path' },
          startLine: { type: 'number', description: 'Start line (1-based, optional)' },
          endLine: { type: 'number', description: 'End line (1-based, inclusive, optional)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: 'Create or update a file. Without line numbers: full write. With line numbers: replace specified lines.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path' },
          content: { type: 'string', description: 'Content to write' },
          startLine: { type: 'number', description: 'Start line for partial replace (1-based, optional)' },
          endLine: { type: 'number', description: 'End line for partial replace (1-based, inclusive, optional)' },
        },
        required: ['path', 'content'],
      },
    },
  ];
}

export async function executeToolCall(
  fileService: FileService,
  toolName: string,
  args: Record<string, any>,
): Promise<ToolCallResult> {
  try {
    switch (toolName) {
      case 'read_file': {
        const data = fileService.readFile({
          path: args.path,
          startLine: args.startLine,
          endLine: args.endLine,
        });
        return { success: true, data };
      }
      case 'write_file': {
        fileService.writeFile({
          path: args.path,
          content: args.content,
          startLine: args.startLine,
          endLine: args.endLine,
        });
        return { success: true, data: { path: args.path, written: true } };
      }
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? String(err) };
  }
}
