import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ContextPreviewResponse, ContextPreviewSection } from '../api/client';
import Modal from './landing/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  fetchPreview: () => Promise<ContextPreviewResponse>;
}

function sectionKindLabel(section: ContextPreviewSection): string {
  switch (section.kind) {
    case 'system_prompt':
      return '系统';
    case 'session_prompt_draft':
      return 'Draft';
    case 'session_prompt':
      return section.title.includes('Draft') ? 'Draft' : 'Session';
    case 'tool_instructions':
      return '工具';
    case 'profile_blocks':
      return 'Profile';
    case 'history_turn':
      return String((section.meta?.role as string) ?? 'History');
    default:
      return section.kind;
  }
}

function formatSourceLabel(sourceLabel?: string): string | null {
  if (!sourceLabel) return null;
  if (sourceLabel === 'built-in default') return '内置默认';
  if (sourceLabel === 'data/tools/*.md') return '工具定义';
  const parts = sourceLabel.split('/');
  return parts[parts.length - 1] ?? sourceLabel;
}

function renderDefaultContent(section: ContextPreviewSection) {
  if (!section.content) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">内容</div>
      <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200 font-mono">{section.content}</pre>
    </div>
  );
}

function renderToolInstruction(section: ContextPreviewSection) {
  const tools = Array.isArray(section.meta?.tools) ? (section.meta?.tools as Array<{ id: string; label: string; content: string }>) : [];
  return (
    <div className="space-y-3">
      {tools.map((tool) => (
        <div key={tool.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3">
          <div className="text-sm text-zinc-200">
            {tool.label} <span className="text-xs text-zinc-500">({tool.id})</span>
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300 font-mono">{tool.content}</pre>
        </div>
      ))}
    </div>
  );
}

function renderProfileBlocks(section: ContextPreviewSection) {
  const blocks = Array.isArray(section.meta?.blocks)
    ? (section.meta?.blocks as Array<{ id: string; name: string; content: string }>)
    : [];
  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <div key={block.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3">
          <div className="text-sm text-zinc-200">{block.name}</div>
          <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300 font-mono">{block.content}</pre>
        </div>
      ))}
    </div>
  );
}

function renderHistory(section: ContextPreviewSection) {
  const parts = Array.isArray(section.meta?.parts)
    ? (section.meta?.parts as Array<{ id: string; title: string; body?: string; content?: string; toolName?: string }>)
    : [];
  return (
    <div className="space-y-3">
      {renderDefaultContent(section)}
      {parts.length > 0 && <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">过程</div>}
      {parts.map((part) => (
        <div key={part.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-zinc-200">{part.title}</div>
            {typeof part.toolName === 'string' && <div className="text-xs text-zinc-400">{part.toolName}</div>}
          </div>
          {(part.body ?? part.content) && (
            <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300 font-mono">
              {part.body ?? part.content}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

const sectionRenderers: Record<ContextPreviewSection['kind'], (section: ContextPreviewSection) => ReactNode> = {
  system_prompt: renderDefaultContent,
  session_prompt_draft: renderDefaultContent,
  session_prompt: renderDefaultContent,
  tool_instructions: renderToolInstruction,
  profile_blocks: renderProfileBlocks,
  history_turn: renderHistory,
};

export default function ContextPreviewModal({ open, onClose, title, description, fetchPreview }: Props) {
  const [data, setData] = useState<ContextPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setExpandedIds([]);
    fetchPreview()
      .then((result) => setData(result))
      .catch((err: unknown) => {
        setData(null);
        setError(err instanceof Error ? err.message : '加载上下文预览失败');
      })
      .finally(() => setLoading(false));
  }, [open, fetchPreview]);

  const sections = useMemo(() => data?.sections ?? [], [data]);

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClassName="max-w-5xl">
      <div className="space-y-4">
        {loading ? (
          <div className="text-zinc-500 text-sm py-10 text-center">加载中...</div>
        ) : error ? (
          <div className="text-red-400 text-sm py-10 text-center">{error}</div>
        ) : sections.length === 0 ? (
          <div className="text-zinc-500 text-sm py-10 text-center">当前没有可展示的上下文模块。</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
              <p className="text-sm text-zinc-400">{description}</p>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1">{sections.length} 个模块</span>
                <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1">按注入顺序排列</span>
              </div>
            </div>

            {sections.map((section) => {
              const expanded = expandedIds.includes(section.id);
              const sourceLabel = formatSourceLabel(section.sourceLabel);
              const Renderer = sectionRenderers[section.kind];

              return (
                <section
                  key={section.id}
                  className="overflow-hidden rounded-2xl border border-zinc-800/90 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(14,14,17,0.96))]"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedIds((current) =>
                        current.includes(section.id) ? current.filter((id) => id !== section.id) : [...current, section.id],
                      )
                    }
                    className="w-full text-left px-4 py-4 hover:bg-zinc-900/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[11px] tracking-wide text-zinc-500">
                            {String(section.order).padStart(2, '0')}
                          </span>
                          <span className="text-sm font-medium text-zinc-100">{section.title}</span>
                          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">
                            {sectionKindLabel(section)}
                          </span>
                          {sourceLabel && <span className="text-[11px] text-zinc-500">{sourceLabel}</span>}
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{section.summary}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-500">
                        {expanded ? '收起' : '展开'}
                      </span>
                    </div>
                  </button>

                  {expanded && <div className="space-y-4 border-t border-zinc-800 px-4 py-4">{Renderer(section)}</div>}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
