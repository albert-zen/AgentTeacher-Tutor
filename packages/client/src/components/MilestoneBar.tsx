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
  if (items.length === 0) return null;

  const completed = items.filter((i) => i.completed).length;

  return (
    <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-zinc-300">{title || '学习进度'}</span>
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
    </div>
  );
}
