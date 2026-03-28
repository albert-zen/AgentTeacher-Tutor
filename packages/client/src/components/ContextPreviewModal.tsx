import { useEffect, useMemo, useState } from 'react';
import type { ContextPreviewResponse, ContextPreviewSection, ContextPreviewProcessPart } from '../api/client';
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
      return 'Session';
    case 'tool_instructions':
      return '工具';
    case 'profile_blocks':
      return 'Profile';
    case 'history_turn':
      return section.meta?.role === 'assistant' ? 'Teacher' : 'User';
    default:
      return section.kind;
  }
}

function processToneClass(part: ContextPreviewProcessPart): string {
  if (part.kind === 'tool-call') return 'border-sky-900/80 bg-sky-950/30';
  if (part.kind === 'tool-result') return 'border-emerald-900/80 bg-emerald-950/20';
  return 'border-zinc-800 bg-zinc-950/60';
}

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

  function shouldRenderRawContent(section: ContextPreviewSection): boolean {
    return section.kind !== 'tool_instructions' && section.kind !== 'profile_blocks';
  }

  function toggleSection(sectionId: string) {
    setExpandedIds((current) =>
      current.includes(sectionId) ? current.filter((id) => id !== sectionId) : [...current, sectionId],
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClassName="max-w-5xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
          <div className="text-sm text-zinc-200">{title}</div>
          <div className="text-xs text-zinc-500 mt-1">{description}</div>
        </div>

        {loading ? (
          <div className="text-zinc-500 text-sm py-10 text-center">加载中...</div>
        ) : error ? (
          <div className="text-red-400 text-sm py-10 text-center">{error}</div>
        ) : sections.length === 0 ? (
          <div className="text-zinc-500 text-sm py-10 text-center">当前没有可展示的上下文模块。</div>
        ) : (
          <div className="space-y-3">
            {sections.map((section) => {
              const expanded = expandedIds.includes(section.id);
              return (
                <section key={section.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className="w-full text-left px-4 py-4 hover:bg-zinc-900/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-zinc-100">{section.title}</span>
                          <span className="px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-900 text-[11px] text-zinc-400">
                            {sectionKindLabel(section)}
                          </span>
                          {section.sourceLabel && (
                            <span className="text-[11px] text-zinc-500">{section.sourceLabel}</span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{section.summary}</p>
                      </div>
                      <span className="text-zinc-500 text-xs shrink-0">{expanded ? '收起' : '展开'}</span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
                      {section.content && shouldRenderRawContent(section) && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">内容</div>
                          <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200 font-mono">
                            {section.content}
                          </pre>
                        </div>
                      )}

                      {section.kind === 'tool_instructions' && section.meta?.tools && (
                        <div className="space-y-3">
                          {section.meta.tools.map((tool) => (
                            <div key={tool.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3">
                              <div className="text-sm text-zinc-200">
                                {tool.label} <span className="text-zinc-500 text-xs">({tool.id})</span>
                              </div>
                              <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300 font-mono">
                                {tool.content}
                              </pre>
                            </div>
                          ))}
                        </div>
                      )}

                      {section.kind === 'profile_blocks' && section.meta?.blocks && (
                        <div className="space-y-3">
                          {section.meta.blocks.map((block) => (
                            <div key={block.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3">
                              <div className="text-sm text-zinc-200">{block.name}</div>
                              <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300 font-mono">
                                {block.content}
                              </pre>
                            </div>
                          ))}
                        </div>
                      )}

                      {section.kind === 'history_turn' && section.meta?.parts && section.meta.parts.length > 0 && (
                        <div className="space-y-3">
                          <div className="text-xs uppercase tracking-wide text-zinc-500">过程</div>
                          {section.meta.parts.map((part) => (
                            <div
                              key={part.id}
                              className={`rounded-xl border px-4 py-3 ${processToneClass(part)}`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm text-zinc-200">{part.title}</div>
                                {part.toolName && <div className="text-xs text-zinc-400">{part.toolName}</div>}
                              </div>
                              {part.content && (
                                <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300 font-mono">
                                  {part.content}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
