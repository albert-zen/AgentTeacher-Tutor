import { useState, useEffect } from 'react';

const MILESTONE_COLLAPSED_KEY = 'teacher-milestone-collapsed';

interface MilestoneItem {
  name: string;
  completed: boolean;
}

interface Props {
  content: string;
}

function parseMilestones(md: string): { title: string; items: MilestoneItem[] } {
  let title = '';
  const items: MilestoneItem[] = [];
  const titleMatch = md.match(/^#\s*里程碑:\s*(.+)$/m);
  if (titleMatch) title = titleMatch[1].trim();
  const itemRegex = /^-\s*\[([xX ])\]\s*(.+)$/gm;
  let match;
  while ((match = itemRegex.exec(md)) !== null) {
    items.push({ name: match[2].trim(), completed: match[1].toLowerCase() === 'x' });
  }
  return { title, items };
}

export default function MilestoneBar({ content }: Props) {
  const { title, items } = parseMilestones(content);

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(MILESTONE_COLLAPSED_KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(MILESTONE_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  if (items.length === 0) return null;

  const completed = items.filter((i) => i.completed).length;
  const pct = Math.round((completed / items.length) * 100);
  const label = title || '学习进度';

  return (
    <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-700">
      {collapsed ? (
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="text-zinc-500 hover:text-zinc-300 mr-2 text-sm leading-none"
            aria-expanded={false}
          >
            ▸
          </button>
          <span className="text-sm font-medium text-zinc-300">{label}</span>
          <div className="bg-zinc-700 rounded-full h-2 flex-1 mx-3">
            <div className="bg-emerald-600 rounded-full h-2" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-zinc-500">
            {completed}/{items.length}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="text-zinc-500 hover:text-zinc-300 mr-2 text-sm leading-none"
                aria-expanded={true}
              >
                ▾
              </button>
              <span className="text-sm font-medium text-zinc-300">{label}</span>
            </div>
            <span className="text-xs text-zinc-500">
              {completed}/{items.length}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {items.map((item) => (
              <span
                key={item.name}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                  item.completed
                    ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                }`}
              >
                <span>{item.completed ? '●' : '○'}</span>
                {item.name}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
