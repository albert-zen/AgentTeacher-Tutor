import { useState, useEffect } from 'react';
import Modal from './Modal';
import * as api from '../../api/client';
import type { ProfileBlock } from '../../api/client';

type Tab = 'edit' | 'blocks';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ProfileModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('edit');
  const [content, setContent] = useState('');
  const [blocks, setBlocks] = useState<ProfileBlock[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([api.getProfile(), api.getProfileBlocks()])
      .then(([profileRes, blocksRes]) => {
        setContent(profileRes.content);
        setBlocks(blocksRes);
        setChecked(new Set(blocksRes.map((b) => b.id)));
      })
      .catch(() => {
        setContent('');
        setBlocks([]);
        setChecked(new Set());
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    await api.updateProfile(content);
    const blocksRes = await api.getProfileBlocks();
    setBlocks(blocksRes);
    setChecked(new Set(blocksRes.map((b) => b.id)));
    setSaving(false);
    onClose();
  };

  const toggleBlock = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="学员档案 / Profile">
      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">加载中...</div>
      ) : (
        <>
          <div className="flex gap-1 mb-3 border-b border-zinc-800">
            <TabButton active={tab === 'edit'} onClick={() => setTab('edit')}>
              编辑
            </TabButton>
            <TabButton active={tab === 'blocks'} onClick={() => setTab('blocks')}>
              分块
            </TabButton>
          </div>

          {tab === 'edit' && (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                '介绍自己的背景、学习目标、偏好的学习方式...\n\n' + '用 # 标题 来分块，例如：\n# 基本信息\n# 学习目标'
              }
              className="w-full h-52 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500 resize-none font-mono"
            />
          )}

          {tab === 'blocks' && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {blocks.length === 0 ? (
                <p className="text-zinc-500 text-sm py-6 text-center">
                  暂无分块 — 在编辑页用 <code className="text-zinc-400"># 标题</code> 分块
                </p>
              ) : (
                blocks.map((block) => (
                  <label
                    key={block.id}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 transition-colors cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(block.id)}
                      onChange={() => toggleBlock(block.id)}
                      className="mt-0.5 accent-zinc-400"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-zinc-200 font-medium">{block.name}</span>
                      {block.content && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{block.content}</p>}
                    </div>
                  </label>
                ))
              )}
            </div>
          )}

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

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'text-zinc-200 border-b-2 border-zinc-400'
          : 'text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent'
      }`}
    >
      {children}
    </button>
  );
}
