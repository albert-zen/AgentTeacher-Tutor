import { useEffect, useState } from 'react';
import Modal from './Modal';
import * as api from '../../api/client';
import type { SearchConfig } from '../../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SearchConfigModal({ open, onClose }: Props) {
  const [config, setConfig] = useState<SearchConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [form, setForm] = useState({
    enabled: false,
    baseURL: '',
    defaultMaxResults: 5,
    timeoutMs: 8000,
  });

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    setFeedback(null);
    api
      .getSearchConfig()
      .then((next) => {
        setConfig(next);
        setForm({
          enabled: next.enabled,
          baseURL: next.baseURL,
          defaultMaxResults: next.defaultMaxResults,
          timeoutMs: next.timeoutMs,
        });
      })
      .catch(() => {
        setConfig(null);
        setLoadError('加载搜索配置失败');
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await api.updateSearchConfig(form);
      setConfig(updated);
      setFeedback({ type: 'success', message: '搜索配置已保存' });
    } catch {
      setFeedback({ type: 'error', message: '保存失败，请检查 SearXNG 地址或网络连接' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="联网搜索 / Web Search">
      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">加载中...</div>
      ) : loadError || !config ? (
        <div className="text-red-400 text-sm py-8 text-center">{loadError ?? '加载搜索配置失败'}</div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <span>
              <span className="block text-sm text-zinc-200">启用联网搜索</span>
              <span className="block text-xs text-zinc-500 mt-0.5">Teacher 可调用 SearXNG 检索外部来源</span>
            </span>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="accent-zinc-300"
            />
          </label>

          <FormField
            label="Provider"
            value={config.provider}
            onChange={() => {}}
            readOnly
          />
          <FormField
            label="Base URL"
            value={form.baseURL}
            onChange={(value) => setForm((prev) => ({ ...prev, baseURL: value }))}
            placeholder="http://127.0.0.1:8080"
          />
          <FormField
            label="默认结果数"
            value={String(form.defaultMaxResults)}
            onChange={(value) => setForm((prev) => ({ ...prev, defaultMaxResults: Number(value || 0) }))}
            type="number"
          />
          <FormField
            label="超时（毫秒）"
            value={String(form.timeoutMs)}
            onChange={(value) => setForm((prev) => ({ ...prev, timeoutMs: Number(value || 0) }))}
            type="number"
          />

          <p className="text-xs text-zinc-500">
            当前允许分类：{config.allowedCategories.join(', ') || '全部'}。高价值结果可由 Teacher 写入
            <code className="text-zinc-400 ml-1">references/</code>。
          </p>

          {feedback && (
            <p className={`text-xs ${feedback.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
              {feedback.message}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
              关闭
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

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors read-only:opacity-70 read-only:cursor-default"
      />
    </div>
  );
}
