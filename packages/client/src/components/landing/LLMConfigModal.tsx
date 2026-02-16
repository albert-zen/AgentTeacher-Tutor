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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .getLLMStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="模型配置 / LLM Config">
      {loading || !status ? (
        <div className="text-zinc-500 text-sm py-8 text-center">加载中...</div>
      ) : (
        <>
          {/* Status badge */}
          <div className="flex items-center gap-2 mb-5">
            <span
              className={`w-2 h-2 rounded-full ${status.configured ? 'bg-emerald-400 shadow-[0_0_6px_theme(--color-emerald-400)]' : 'bg-red-400 shadow-[0_0_6px_theme(--color-red-400)]'}`}
            />
            <span className={`text-sm ${status.configured ? 'text-emerald-400' : 'text-red-400'}`}>
              {status.configured ? '已连接' : '未配置'}
            </span>
          </div>

          {/* Info rows */}
          <div className="space-y-3">
            <InfoRow label="Provider" value={status.provider} />
            <InfoRow label="Model" value={status.model} />
            <InfoRow label="Base URL" value={status.baseURL} />
          </div>

          <p className="text-xs text-zinc-600 mt-5 leading-relaxed">
            模型配置通过 <code className="text-zinc-500">.env</code> 文件管理，修改后需重启服务器。
          </p>
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
