import type { Store } from '../db/index.js';
import type { ContextSection } from './contextSections.js';
import { contextSectionsService } from './contextSections.js';
import type { ToolId } from './toolDefinitions.js';

export type ContextPreviewSectionKind =
  | 'system_prompt'
  | 'session_prompt_draft'
  | 'session_prompt'
  | 'tool_instructions'
  | 'profile_blocks'
  | 'history_turn';

export interface ContextPreviewSection {
  id: string;
  kind: ContextPreviewSectionKind;
  title: string;
  summary: string;
  sourceLabel?: string;
  order: number;
  content?: string;
  meta?: Record<string, unknown>;
}

export interface ContextPreviewResponse {
  sections: ContextPreviewSection[];
}

function summarize(text: string, maxLength = 120): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '暂无内容';
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}

function groupSectionsForPreview(sections: ContextSection[]): ContextPreviewSection[] {
  const grouped: ContextPreviewSection[] = [];
  const toolSections = sections.filter((section) => section.kind === 'tool_instruction');
  const profileSections = sections.filter((section) => section.kind === 'profile_block');

  for (const section of sections) {
    if (section.kind === 'tool_instruction' || section.kind === 'profile_block' || section.kind === 'history_part') {
      continue;
    }

    if (section.kind === 'history_turn') {
      grouped.push({
        id: section.id,
        kind: 'history_turn',
        title: section.title,
        summary: summarize(section.body),
        sourceLabel: section.source,
        order: section.order,
        content: section.body,
        meta: section.meta,
      });
      continue;
    }

    grouped.push({
      id: section.id,
      kind:
        section.kind === 'session_prompt' && section.meta?.scope === 'draft'
          ? 'session_prompt_draft'
          : (section.kind as ContextPreviewSectionKind),
      title: section.title,
      summary: summarize(section.body),
      sourceLabel: section.source,
      order: section.order,
      content: section.body,
      meta: section.meta,
    });
  }

  if (toolSections.length > 0) {
    grouped.push({
      id: 'tool-instructions',
      kind: 'tool_instructions',
      title: '工具提示词',
      summary: `${toolSections.length} 个启用工具会向模型注入额外说明`,
      sourceLabel: 'data/tools/*.md',
      order: Math.min(...toolSections.map((section) => section.order)),
      content: toolSections.map((section) => `## ${section.title}\n${section.body}`).join('\n\n'),
      meta: {
        tools: toolSections.map((section) => ({
          id: section.meta?.toolId as ToolId,
          label: section.meta?.label as string,
          content: section.body,
        })),
      },
    });
  }

  if (profileSections.length > 0) {
    grouped.push({
      id: 'profile-blocks',
      kind: 'profile_blocks',
      title: '用户 Profile',
      summary: `${profileSections.length} 个档案块会进入模型上下文`,
      sourceLabel: 'data/profile.md',
      order: Math.min(...profileSections.map((section) => section.order)),
      content: profileSections.map((section) => `## ${section.title}\n${section.body}`).join('\n\n'),
      meta: {
        blocks: profileSections.map((section) => ({
          id: section.meta?.blockId,
          name: section.title,
          content: section.body,
        })),
      },
    });
  }

  return grouped.sort((a, b) => a.order - b.order);
}

export function buildTemplateContextPreview(dataDir: string): ContextPreviewResponse {
  return {
    sections: groupSectionsForPreview(contextSectionsService.buildDraftSections(dataDir)),
  };
}

export function buildSessionContextMemory(dataDir: string, store: Store, sessionId: string): ContextPreviewResponse {
  return {
    sections: groupSectionsForPreview(contextSectionsService.buildSessionSections(dataDir, store, sessionId)),
  };
}
