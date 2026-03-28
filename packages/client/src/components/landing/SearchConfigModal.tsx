import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import * as api from '../../api/client';
import type { ToolState, ToolsResponse, WebSearchToolConfig } from '../../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SearchConfigModal({ open, onClose }: Props) {
  const [state, setState] = useState<ToolsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyToolId, setBusyToolId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState<WebSearchToolConfig | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    setFeedback(null);
    api
      .getTools()
      .then((next) => {
        setState(next);
        const webSearch = next.tools.find((tool) => tool.id === 'web_search');
        setSearchDraft((webSearch?.config as WebSearchToolConfig) ?? null);
      })
      .catch(() => {
        setState(null);
        setLoadError('加载工具配置失败');
      })
      .finally(() => setLoading(false));
  }, [open]);

  const tools = useMemo(() => state?.tools ?? [], [state]);

  async function handleToggle(tool: ToolState, enabledByDefault: boolean) {
    setBusyToolId(tool.id);
    setFeedback(null);
    try {
      const next = await api.updateTool(tool.id, { enabledByDefault });
      setState(next);
      const webSearch = next.tools.find((item) => item.id === 'web_search');
      setSearchDraft((webSearch?.config as WebSearchToolConfig) ?? null);
    } catch (error: unknown) {
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyToolId(null);
    }
  }

  async function handleRuntimeAction(toolId: ToolState['id'], action: 'start' | 'stop' | 'restart' | 'check') {
    setBusyToolId(`${toolId}:${action}`);
    setFeedback(null);
    try {
      const updated = await api.runToolRuntimeAction(toolId, action);
      setState((prev) =>
        prev
          ? {
              ...prev,
              tools: prev.tools.map((tool) => (tool.id === toolId ? updated : tool)),
            }
          : prev,
      );
    } catch (error: unknown) {
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyToolId(null);
    }
  }

  async function handleSaveSearch() {
    if (!searchDraft) return;
    setBusyToolId('web_search:save');
    setFeedback(null);
    try {
      const next = await api.updateTool('web_search', searchDraft);
      setState(next);
      const webSearch = next.tools.find((tool) => tool.id === 'web_search');
      setSearchDraft((webSearch?.config as WebSearchToolConfig) ?? null);
      setFeedback('联网搜索工具配置已保存');
    } catch (error: unknown) {
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyToolId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tools / 工具管理">
      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">加载中...</div>
      ) : loadError || !state ? (
        <div className="text-red-400 text-sm py-8 text-center">{loadError ?? '加载工具配置失败'}</div>
      ) : (
        <div className="space-y-4">
          {tools.map((tool) => (
            <div key={tool.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-zinc-200">{tool.label}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{tool.description}</div>
                </div>
                <RuntimeBadge status={tool.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                <div>模式：{tool.runtimeMode}</div>
                <div>模型可见：{tool.exposeToModel ? '是' : '否'}</div>
              </div>

              {tool.message && <div className="text-xs text-amber-300">{tool.message}</div>}

              <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <span>
                  <span className="block text-sm text-zinc-200">默认启用</span>
                  <span className="block text-xs text-zinc-500 mt-0.5">控制新 Session 默认是否向 Teacher 暴露该工具</span>
                </span>
                <input
                  type="checkbox"
                  checked={tool.config.enabledByDefault}
                  disabled={busyToolId === tool.id}
                  onChange={(event) => handleToggle(tool, event.target.checked)}
                  className="accent-zinc-300"
                />
              </label>

              {tool.id === 'web_search' && searchDraft && (
                <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      label="Runtime Mode"
                      value={searchDraft.runtimeMode}
                      onChange={(value) =>
                        setSearchDraft((prev) => (prev ? { ...prev, runtimeMode: value as WebSearchToolConfig['runtimeMode'] } : prev))
                      }
                    />
                    <FormField
                      label="Sidecar Port"
                      value={String(searchDraft.sidecar.port)}
                      onChange={(value) =>
                        setSearchDraft((prev) =>
                          prev ? { ...prev, sidecar: { port: Number(value || 0) } } : prev,
                        )
                      }
                      type="number"
                    />
                    <FormField
                      label="Backend Port"
                      value={String(searchDraft.backend.port)}
                      onChange={(value) =>
                        setSearchDraft((prev) =>
                          prev ? { ...prev, backend: { port: Number(value || 0) } } : prev,
                        )
                      }
                      type="number"
                    />
                    <FormField
                      label="Remote Base URL"
                      value={searchDraft.upstream.remoteBaseURL}
                      onChange={(value) =>
                        setSearchDraft((prev) =>
                          prev ? { ...prev, upstream: { ...prev.upstream, remoteBaseURL: value } } : prev,
                        )
                      }
                    />
                    <FormField
                      label="默认结果数"
                      value={String(searchDraft.defaultMaxResults)}
                      onChange={(value) =>
                        setSearchDraft((prev) => (prev ? { ...prev, defaultMaxResults: Number(value || 0) } : prev))
                      }
                      type="number"
                    />
                    <FormField
                      label="超时（毫秒）"
                      value={String(searchDraft.timeoutMs)}
                      onChange={(value) =>
                        setSearchDraft((prev) => (prev ? { ...prev, timeoutMs: Number(value || 0) } : prev))
                      }
                      type="number"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <RuntimeButton
                      disabled={busyToolId !== null}
                      onClick={() => handleRuntimeAction('web_search', 'check')}
                      label="检查"
                    />
                    <RuntimeButton
                      disabled={busyToolId !== null || searchDraft.runtimeMode !== 'managed'}
                      onClick={() => handleRuntimeAction('web_search', 'start')}
                      label="启动"
                    />
                    <RuntimeButton
                      disabled={busyToolId !== null || searchDraft.runtimeMode !== 'managed'}
                      onClick={() => handleRuntimeAction('web_search', 'restart')}
                      label="重启"
                    />
                    <RuntimeButton
                      disabled={busyToolId !== null || searchDraft.runtimeMode !== 'managed'}
                      onClick={() => handleRuntimeAction('web_search', 'stop')}
                      label="停止"
                    />
                    <button
                      onClick={handleSaveSearch}
                      disabled={busyToolId !== null}
                      className="px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded transition-colors disabled:opacity-50"
                    >
                      保存搜索配置
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {feedback && <div className="text-xs text-zinc-400">{feedback}</div>}
        </div>
      )}
    </Modal>
  );
}

function RuntimeBadge({ status }: { status: ToolState['status'] }) {
  const styles: Record<ToolState['status'], string> = {
    disabled: 'bg-zinc-800 text-zinc-400',
    stopped: 'bg-zinc-800 text-zinc-400',
    starting: 'bg-amber-950/70 text-amber-300',
    ready: 'bg-emerald-950/70 text-emerald-300',
    error: 'bg-red-950/70 text-red-300',
  };
  return <span className={`px-2 py-1 rounded-full text-[11px] ${styles[status]}`}>{status}</span>;
}

function RuntimeButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-300 rounded hover:border-zinc-500 hover:text-zinc-100 transition-colors disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
      />
    </div>
  );
}
