import { useState, useEffect, useCallback } from 'react';
import FileTree from './components/FileTree';
import MarkdownEditor from './components/MarkdownEditor';
import ChatPanel from './components/ChatPanel';
import MilestoneBar from './components/MilestoneBar';
import { useSession } from './hooks/useSession';
import { useTextSelection } from './hooks/useTextSelection';
import * as api from './api/client';

export default function App() {
  const { session, messages, files, streaming, streamingText, startSession, send, refreshFiles } = useSession();
  const { selection, handleSelection, clearSelection, getReference } = useTextSelection();

  const [conceptInput, setConceptInput] = useState('');
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [milestonesContent, setMilestonesContent] = useState('');

  // Load file content when active file changes
  useEffect(() => {
    if (!session || !activeFile) return;
    api.readFile(session.id, activeFile).then((res) => {
      setFileContent(res.content);
    }).catch(() => setFileContent(''));
  }, [session, activeFile]);

  // Auto-select guidance.md when files change
  useEffect(() => {
    if (files.length > 0 && !activeFile) {
      const guidance = files.find((f) => f === 'guidance.md');
      setActiveFile(guidance ?? files[0]);
    }
  }, [files, activeFile]);

  // Load milestones whenever files refresh
  useEffect(() => {
    if (!session || !files.includes('milestones.md')) return;
    api.readFile(session.id, 'milestones.md').then((res) => {
      setMilestonesContent(res.content);
    }).catch(() => {});
  }, [session, files]);

  // Reload active file content when files list changes (Teacher may have updated it)
  useEffect(() => {
    if (!session || !activeFile || !files.includes(activeFile)) return;
    api.readFile(session.id, activeFile).then((res) => {
      setFileContent(res.content);
    }).catch(() => {});
  }, [files]);

  const handleStart = () => {
    const concept = conceptInput.trim();
    if (!concept) return;
    startSession(concept);
    setConceptInput('');
  };

  const handleCreateFile = useCallback(async (name: string) => {
    if (!session) return;
    await api.writeFile(session.id, name, `# ${name.replace('.md', '')}\n\n`);
    refreshFiles();
    setActiveFile(name);
  }, [session, refreshFiles]);

  const handleDeleteFile = useCallback(async (name: string) => {
    if (!session) return;
    await api.deleteFile(session.id, name);
    if (activeFile === name) setActiveFile(null);
    refreshFiles();
  }, [session, activeFile, refreshFiles]);

  const handleSaveFile = useCallback(async (content: string) => {
    if (!session || !activeFile) return;
    await api.writeFile(session.id, activeFile, content);
    setFileContent(content);
  }, [session, activeFile]);

  const handleReferenceClick = useCallback((file: string) => {
    if (files.includes(file)) {
      setActiveFile(file);
    }
  }, [files]);

  // No session: show concept input
  if (!session) {
    return (
      <div className="h-full bg-zinc-950 flex items-center justify-center">
        <div className="w-full max-w-md px-6">
          <h1 className="text-2xl font-bold text-white mb-2">Teacher Agent</h1>
          <p className="text-zinc-400 text-sm mb-6">输入你想学习的概念，开始学习之旅</p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={conceptInput}
              onChange={(e) => setConceptInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              placeholder="例如：神经网络、量子力学、微积分..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-blue-500"
            />
            <button
              onClick={handleStart}
              disabled={!conceptInput.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg font-medium"
            >
              开始
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-zinc-950">
      {/* File Tree */}
      <div className="w-52 flex-shrink-0 border-r border-zinc-800">
        <FileTree
          files={files}
          activeFile={activeFile}
          onSelect={setActiveFile}
          onCreate={handleCreateFile}
          onDelete={handleDeleteFile}
        />
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <MilestoneBar content={milestonesContent} />
        {activeFile ? (
          <div className="flex-1 min-h-0">
            <MarkdownEditor
              fileName={activeFile}
              content={fileContent}
              onSave={handleSaveFile}
              onMouseUp={() => handleSelection(activeFile, fileContent)}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
            等待 Teacher 生成文件...
          </div>
        )}
      </div>

      {/* Chat Panel */}
      <div className="w-96 flex-shrink-0 border-l border-zinc-800">
        <ChatPanel
          messages={messages}
          streaming={streaming}
          streamingText={streamingText}
          selection={selection}
          onSend={send}
          onClearSelection={clearSelection}
          getReference={getReference}
          onReferenceClick={handleReferenceClick}
        />
      </div>
    </div>
  );
}
