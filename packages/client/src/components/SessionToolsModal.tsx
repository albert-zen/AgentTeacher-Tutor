import { useEffect, useState } from 'react';
import Modal from './landing/Modal';
import * as api from '../api/client';
import type { SessionToolsResponse, ToolState } from '../api/client';

interface Props {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

export default function SessionToolsModal({ sessionId, open, onClose }: Props) {
  const [state, setState] = useState<SessionToolsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyToolId, setBusyToolId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    api
      .getSessionTools(sessionId)
      .then(setState)
      .catch(() => {
        setState(null);
        setLoadError('加载 Session 工具配置失败');
      })
      .finally(() => setLoading(false));
  }, [open, sessionId]);

  async function handleSessionToggle(tool: ToolState, enabled: boolean) {
    setBusyToolId(tool.id);
    try {
      const next = await api.updateSessionTool(sessionId, {
        toolId: tool.id,
        enabled,
      });
      setState(next);
    } finally {
      setBusyToolId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Session 工具">
      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">加载中...</div>
      ) : loadError || !state ? (
        <div className="text-red-400 text-sm py-8 text-center">{loadError ?? '加载 Session 工具配置失败'}</div>
      ) : (
        <div className="space-y-4">
          {state.tools.map((tool) => (
            <div key={tool.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-zinc-200">{tool.label}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{tool.description}</div>
                </div>
                <span className="px-2 py-1 rounded-full text-[11px] bg-zinc-900 text-zinc-400">{tool.status}</span>
              </div>

              {tool.message && <div className="text-xs text-amber-300">{tool.message}</div>}

              <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <span>
                  <span className="block text-sm text-zinc-200">当前 Session 启用</span>
                  <span className="block text-xs text-zinc-500 mt-0.5">
                    只影响这个 Session 的模型可见工具快照，不会回写到 landing 的新 Session 草稿
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={tool.enabled}
                  disabled={busyToolId === tool.id}
                  onChange={(event) => handleSessionToggle(tool, event.target.checked)}
                  className="accent-zinc-300"
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
