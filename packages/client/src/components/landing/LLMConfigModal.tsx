import { useState, useEffect } from 'react';
import Modal from './Modal';
import * as api from '../../api/client';
import type { LLMStatus } from '../../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function LLMConfigModal({ open, onClose }: Props) {
  const [status, setStatus] = useState<LLMStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [form, setForm] = useState({
    provider: '',
    apiKey: '',
    baseURL: '',
    model: '',
  });

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setEditing(false);
    setFeedback(null);
    api
      .getLLMStatus()
      .then((s) => {
        setStatus(s);
        setForm({ provider: s.provider, apiKey: '', baseURL: s.baseURL, model: s.model });
      })
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [open]);

  function startEditing() {
    if (status) {
      setForm({ provider: status.provider, apiKey: '', baseURL: status.baseURL, model: status.model });
    }
    setFeedback(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const updates: Record<string, string> = {};
      if (form.provider) updates.provider = form.provider;
      if (form.apiKey) updates.apiKey = form.apiKey;
      if (form.baseURL) updates.baseURL = form.baseURL;
      if (form.model) updates.model = form.model;

      const updated = await api.updateLLMConfig(updates);
      setStatus(updated);
      setEditing(false);
      setFeedback({ type: 'success', message: '配置已保存，下次对话将使用新配置' });
    } catch {
      setFeedback({ type: 'error', message: '保存失败，请检查网络连接' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="模型配置 / LLM Config">
      {loading || !status ? (
        <div className="text-zinc-500 text-sm py-8 text-center">加载中...</div>
      ) : editing ? (
        <div className="space-y-4">
          <FormField
            label="Provider"
            value={form.provider}
            onChange={(v) => setForm({ ...form, provider: v })}
            placeholder="openai"
          />
          <FormField
            label="API Key"
            value={form.apiKey}
            onChange={(v) => setForm({ ...form, apiKey: v })}
            placeholder="留空则保持不变"
            type="password"
          />
          <FormField
            label="Base URL"
            value={form.baseURL}
            onChange={(v) => setForm({ ...form, baseURL: v })}
            placeholder="https://api.openai.com/v1"
          />
          <FormField
            label="Model"
            value={form.model}
            onChange={(v) => setForm({ ...form, model: v })}
            placeholder="gpt-4o"
          />

          {feedback && (
            <p className={`text-xs ${feedback.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
              {feedback.message}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="px-3 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-50"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-5">
            <span
              className={`w-2 h-2 rounded-full ${status.configured ? 'bg-emerald-400 shadow-[0_0_6px_theme(--color-emerald-400)]' : 'bg-red-400 shadow-[0_0_6px_theme(--color-red-400)]'}`}
            />
            <span className={`text-sm ${status.configured ? 'text-emerald-400' : 'text-red-400'}`}>
              {status.configured ? '已连接' : '未配置'}
            </span>
          </div>

          <div className="space-y-3">
            <InfoRow label="Provider" value={status.provider} />
            <InfoRow label="Model" value={status.model} />
            <InfoRow label="Base URL" value={status.baseURL} />
          </div>

          {feedback && (
            <p className={`text-xs mt-4 ${feedback.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
              {feedback.message}
            </p>
          )}

          <button
            onClick={startEditing}
            className="mt-5 w-full px-3 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          >
            修改配置
          </button>
        </>
      )}
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-zinc-500 shrink-0">{label}</span>
      <span className="text-sm text-zinc-300 font-mono truncate">{value}</span>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
      />
    </div>
  );
}
