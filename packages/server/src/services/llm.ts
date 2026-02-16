import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool, stepCountIs, type ModelMessage } from 'ai';
import { z } from 'zod';
import type { FileService } from './fileService.js';
import { executeToolCall } from './teacher.js';

export interface LLMConfig {
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

export function isLLMConfigured(config: LLMConfig): boolean {
  return !!(config.apiKey && config.apiKey !== 'your-api-key-here');
}

export function createLLMClient(config: LLMConfig) {
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  // Use .chat() to force /chat/completions endpoint (not /responses)
  // Required for OpenAI-compatible providers like DashScope
  return openai.chat(config.model);
}

export function buildTools(fileService: FileService) {
  return {
    read_file: tool({
      description: 'Read a file or specific line range from the session workspace.',
      inputSchema: z.object({
        path: z.string().describe('Relative file path'),
        startLine: z.number().optional().describe('Start line (1-based)'),
        endLine: z.number().optional().describe('End line (1-based, inclusive)'),
      }),
      execute: async (args) => {
        return executeToolCall(fileService, 'read_file', args);
      },
    }),
    write_file: tool({
      description: 'Create or update a file. Without line numbers: full write. With line numbers: replace specified lines.',
      inputSchema: z.object({
        path: z.string().describe('Relative file path'),
        content: z.string().describe('Content to write'),
        startLine: z.number().optional().describe('Start line for partial replace (1-based)'),
        endLine: z.number().optional().describe('End line for partial replace (1-based, inclusive)'),
      }),
      execute: async (args) => {
        return executeToolCall(fileService, 'write_file', args);
      },
    }),
  };
}

export function getSystemPrompt(): string {
  return `You are a Teacher Agent — an expert educator who helps students deeply understand concepts.

## Your Role
You teach by creating structured learning materials and guiding students through concepts step by step.

## Your Tools
You have two file tools:
- **read_file**: Read a file or specific line range to review content
- **write_file**: Create or modify files in the session workspace

## Key Files You Manage
- **ground-truth.md**: Your comprehensive, systematic understanding of the concept. Students can see this file and ask about it. You may update it as your understanding evolves during teaching.
- **guidance.md**: Your teaching material tailored to the student. You should actively rewrite sections or restructure this file when the student asks questions or shows confusion.
- **milestones.md**: Progress tracking file using checkbox format. Update this when a student demonstrates mastery of a basic element.

### milestones.md Format
\`\`\`
# 里程碑: <concept name>

- [ ] Element A
- [x] Element B (mastered)
\`\`\`

## Teaching Flow
1. When a student asks to learn a concept, create ground-truth.md, guidance.md, and milestones.md
2. Break the concept into fundamental "Basic Elements" as milestones
3. When a student asks about a specific part, answer AND consider updating guidance.md to better explain that part
4. When a student demonstrates understanding (through questions or reverse output), update milestones
5. You may proactively suggest the student try explaining their understanding when you sense they're ready

## File References
Students may reference file sections using [filename:startLine:endLine] format. When you see these, use read_file to load the referenced content if needed.

## Student Profile
If student profile information is provided, adapt your teaching style, examples, and depth accordingly.

## Guidelines
- Be encouraging but honest about gaps in understanding
- Use analogies and examples relevant to the student's background
- When updating guidance.md, you can modify just the relevant section OR restructure the entire document — use your judgment
- Always respond in the same language the student uses`;
}

export async function streamTeacherResponse(
  model: ReturnType<typeof createLLMClient>,
  fileService: FileService,
  messages: ModelMessage[],
) {
  const tools = buildTools(fileService);

  return streamText({
    model,
    system: getSystemPrompt(),
    messages,
    tools,
    stopWhen: stepCountIs(10),
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- StreamTextResult generic is too complex to name
}
