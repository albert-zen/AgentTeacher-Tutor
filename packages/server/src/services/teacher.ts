import type { FileService } from './fileService.js';

export async function executeToolCall(fileService: FileService, toolName: string, args: Record<string, any>) {
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
