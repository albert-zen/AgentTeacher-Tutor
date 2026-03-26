import { useEffect, useState } from 'react';
import Modal from './landing/Modal';
import * as api from '../api/client';
import type { SessionSearchConfigState } from '../api/client';

interface Props {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

export default function SessionSearchConfigModal({ sessionId, open, onClose }: Props) {
  const [state, setState] = useState<SessionSearchConfigState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [override, setOverride] = useState(false);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    api
      .getSessionSearchConfig(sessionId)
      .then((next) => {
        setState(next);
        setOverride(next.override);
        setEnabled(next.localConfig?.enabled ?? next.effectiveConfig.enabled);
      })
      .catch(() => {
        setState(null);
        setLoadError('加载 Session 搜索配置失败');
      })
      .finally(() => setLoading(false));
  }, [open, sessionId]);

  async function handleSave() {
    setSaving(true);
    try {
      const next = await api.updateSessionSearchConfig(sessionId, { override, enabled });
      setState(next);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Session 联网搜索">
      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">加载中...</div>
      ) : loadError || !state ? (
        <div className="text-red-400 text-sm py-8 text-center">{loadError ?? '加载 Session 搜索配置失败'}</div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            当前生效状态：
            <span className={state.effectiveConfig.enabled ? 'text-emerald-400 ml-1' : 'text-red-400 ml-1'}>
              {state.effectiveConfig.enabled ? '已启用' : '已关闭'}
            </span>
          </p>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <span>
              <span className="block text-sm text-zinc-200">覆盖全局设置</span>
              <span className="block text-xs text-zinc-500 mt-0.5">仅为当前 Session 单独控制 Teacher 的联网能力</span>
            </span>
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              className="accent-zinc-300"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <span>
              <span className="block text-sm text-zinc-200">本 Session 启用联网搜索</span>
              <span className="block text-xs text-zinc-500 mt-0.5">
                关闭时，Teacher 调用 <code className="text-zinc-400">web_search</code> 会收到不可用提示
              </span>
            </span>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!override}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-zinc-300 disabled:opacity-40"
            />
          </label>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-500">
            生效配置：{state.effectiveConfig.provider} / {state.effectiveConfig.baseURL} / 默认返回{' '}
            {state.effectiveConfig.defaultMaxResults} 条结果
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
