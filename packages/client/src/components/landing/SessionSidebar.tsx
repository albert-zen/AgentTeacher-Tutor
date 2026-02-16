import { useState, useEffect } from 'react';
import type { Session } from '../../api/client';

const SIDEBAR_KEY = 'teacher-sidebar-collapsed';

interface Props {
  sessions: Session[];
  onSelect: (id: string) => void;
}

export default function SessionSidebar({ sessions, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_KEY) === 'true';
  });
  const [search, setSearch] = useState('');

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(collapsed));
  }, [collapsed]);

  const filtered = sessions
    .slice()
    .reverse()
    .filter((s) => s.concept.toLowerCase().includes(search.toLowerCase()));

  if (collapsed) {
    return (
      <div className="w-10 border-r border-zinc-800 bg-zinc-900/50 flex flex-col items-center pt-3 shrink-0 transition-all duration-200">
        <button
          onClick={() => setCollapsed(false)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
          title="展开侧栏"
        >
          &raquo;
        </button>
      </div>
    );
  }

  return (
    <div className="w-52 border-r border-zinc-800 bg-zinc-900/50 flex flex-col shrink-0 transition-all duration-200">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sessions</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
          title="折叠侧栏"
        >
          &laquo;
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索..."
          className="w-full bg-zinc-800/80 border border-zinc-700/60 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-600 transition-colors"
        />
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-zinc-600 px-3 py-4 text-center">{search ? '无匹配结果' : '暂无会话'}</p>
        )}
        {filtered.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="w-full text-left px-3 py-2 hover:bg-zinc-800/70 transition-colors group"
          >
            <div className="text-sm text-zinc-300 group-hover:text-zinc-100 truncate">{s.concept}</div>
            <div className="text-xs text-zinc-600 mt-0.5">
              {new Date(s.createdAt).toLocaleDateString('zh-CN', {
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
