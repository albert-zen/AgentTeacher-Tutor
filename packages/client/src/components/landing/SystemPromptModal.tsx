import { useState, useEffect } from 'react';
import Modal from './Modal';
import * as api from '../../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SystemPromptModal({ open, onClose }: Props) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .getSystemPrompt()
      .then((res) => setContent(res.content))
      .catch(() => setContent(''))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    await api.updateSystemPrompt(content);
    setSaving(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="教师指令 / System Prompt">
      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">加载中...</div>
      ) : (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="自定义 Teacher Agent 的行为指令...&#10;&#10;例如：用英文教学、多用代码示例、适合初学者..."
            className="w-full h-52 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500 resize-none font-mono"
          />
          <p className="text-xs text-zinc-600 mt-2">留空则使用默认提示词</p>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 rounded-lg transition-colors"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
