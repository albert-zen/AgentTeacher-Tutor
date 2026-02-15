import { useState } from 'react';

interface Props {
  files: string[];
  activeFile: string | null;
  onSelect: (file: string) => void;
  onCreate: (name: string) => void;
  onDelete: (file: string) => void;
}

export default function FileTree({ files, activeFile, onSelect, onCreate, onDelete }: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const name = newName.trim();
    if (name) {
      onCreate(name.endsWith('.md') ? name : `${name}.md`);
      setNewName('');
      setCreating(false);
    }
  };

  const icon = (file: string) => {
    if (file === 'guidance.md') return '📖';
    if (file === 'ground-truth.md') return '🎯';
    if (file === 'milestones.md') return '🏁';
    return '📝';
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900 text-zinc-300 text-sm">
      <div className="px-3 py-2 border-b border-zinc-700 flex items-center justify-between">
        <span className="font-semibold text-zinc-400 uppercase tracking-wide text-xs">Files</span>
        <button
          onClick={() => setCreating(true)}
          className="text-zinc-500 hover:text-zinc-200 text-lg leading-none"
          title="New file"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {files.map((file) => (
          <div
            key={file}
            onClick={() => onSelect(file)}
            className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-zinc-800 ${
              activeFile === file ? 'bg-zinc-800 text-white' : ''
            }`}
          >
            <span>{icon(file)}</span>
            <span className="flex-1 truncate">{file}</span>
            {!['guidance.md', 'ground-truth.md', 'milestones.md'].includes(file) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(file);
                }}
                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {creating && (
        <div className="px-3 py-2 border-t border-zinc-700">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setCreating(false);
            }}
            placeholder="filename.md"
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm outline-none focus:border-blue-500"
          />
        </div>
      )}
    </div>
  );
}
