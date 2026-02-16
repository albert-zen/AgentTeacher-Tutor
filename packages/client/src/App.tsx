import { useState, useEffect, useCallback } from 'react';
import FileTree from './components/FileTree';
import MarkdownEditor from './components/MarkdownEditor';
import ChatPanel from './components/ChatPanel';
import MilestoneBar from './components/MilestoneBar';
import SelectionPopup from './components/SelectionPopup';
import { useSession } from './hooks/useSession';
import { useTextSelection } from './hooks/useTextSelection';
import * as api from './api/client';

export default function App() {
  const { session, messages, files, streaming, streamingText, startSession, loadSession, clearSession, send, refreshFiles } = useSession();
  const { selection, handleSelection, clearSelection, getReference } = useTextSelection();

  const [conceptInput, setConceptInput] = useState('');
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [pastSessions, setPastSessions] = useState<api.Session[]>([]);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
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

  // Load past sessions on mount and when returning to landing page
  useEffect(() => {
    if (!session) {
      api.getSessions().then(setPastSessions).catch(() => {});
    }
  }, [session]);

  const handleLoadSession = async (id: string) => {
    await loadSession(id);
    setActiveFile(null);
  };

  // No session: show concept input + session list
  if (!session) {
    return (
      <div className="h-full bg-zinc-950 flex items-center justify-center">
        <div className="w-full max-w-lg px-6">
          <h1 className="text-2xl font-bold text-white mb-2">Teacher Agent</h1>
          <p className="text-zinc-400 text-sm mb-6">输入你想学习的概念，开始学习之旅</p>
          <div className="flex gap-2 mb-8">
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
          {pastSessions.length > 0 && (
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wide mb-3">继续学习</p>
              <div className="space-y-2">
                {pastSessions.slice().reverse().map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleLoadSession(s.id)}
                    className="w-full text-left px-4 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors"
                  >
                    <span className="text-white text-sm">{s.concept}</span>
                    <span className="text-zinc-600 text-xs ml-2">
                      {new Date(s.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Session Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              clearSession();
              setActiveFile(null);
            }}
            className="text-zinc-400 hover:text-white text-sm flex items-center gap-1"
          >
            <span>&larr;</span>
            <span>Sessions</span>
          </button>
          <span className="text-zinc-600">|</span>
          <span className="text-sm text-zinc-300 font-medium">{session.concept}</span>
        </div>
      </div>

      {/* Main workspace */}
      <div className="flex-1 flex min-h-0">
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
            pendingAsk={pendingAsk}
            onClearPendingAsk={() => setPendingAsk(null)}
            onSend={send}
            onClearSelection={clearSelection}
            getReference={getReference}
            onReferenceClick={handleReferenceClick}
          />
        </div>
      </div>

      <SelectionPopup
        onAsk={(selectedText) => {
          if (activeFile) {
            handleSelection(activeFile, fileContent);
          }
          setPendingAsk(selectedText);
        }}
      />
    </div>
  );
}
