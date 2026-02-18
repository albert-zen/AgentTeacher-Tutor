import { useState, useEffect } from 'react';
import Modal from './Modal';
import * as api from '../../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SessionPromptDraftModal({ open, onClose }: Props) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    api
      .getSessionPromptDraft()
      .then((res) => {
        setContent(res.content);
        setLoaded(true);
      })
      .catch(() => {
        setContent('');
        setLoaded(true);
      });
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSessionPromptDraft(content);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="新 Session 教学指令">
      <p className="text-xs text-zinc-500 mb-3">开始新 Session 时会自动注入此内容。每个 Session 创建后可独立修改。</p>
      {loaded ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="例如：该学生有物理背景，请多用物理类比..."
          className="w-full h-48 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500 transition-colors"
        />
      ) : (
        <div className="w-full h-48 bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center text-zinc-600 text-sm">
          加载中...
        </div>
      )}
      <div className="flex justify-end gap-2 mt-3">
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
    </Modal>
  );
}
