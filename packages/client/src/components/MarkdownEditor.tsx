import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface Props {
  fileName: string;
  content: string;
  readOnly?: boolean;
  onSave?: (content: string) => void;
  onMouseUp?: () => void;
  onCopy?: () => void;
}

export default function MarkdownEditor({ fileName, content, readOnly, onSave, onMouseUp, onCopy }: Props) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);

  useEffect(() => {
    setEditContent(content);
    setEditing(false);
  }, [content, fileName]);

  const handleSave = () => {
    onSave?.(editContent);
    setEditing(false);
  };

  const isSystemFile = ['guidance.md', 'ground-truth.md', 'milestones.md'].includes(fileName);

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">{fileName}</span>
        <div className="flex gap-2">
          {!isSystemFile && !readOnly && (
            <>
              {editing ? (
                <>
                  <button
                    onClick={handleSave}
                    className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setEditContent(content);
                    }}
                    className="px-2 py-0.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="px-2 py-0.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded"
                >
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" onMouseUp={onMouseUp} onCopy={onCopy}>
        {editing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full p-4 bg-zinc-950 text-zinc-200 resize-none outline-none font-mono text-sm"
          />
        ) : (
          <div className="p-4 prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
