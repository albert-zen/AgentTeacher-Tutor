import { useState, useEffect, useCallback, useRef } from 'react';
import FileTree from './components/FileTree';
import MarkdownEditor from './components/MarkdownEditor';
import ChatPanel from './components/ChatPanel';
import MilestoneBar from './components/MilestoneBar';
import SelectionPopup from './components/SelectionPopup';
import ResizeHandle from './components/ResizeHandle';
import LandingPage from './components/landing/LandingPage';
import SessionPromptModal from './components/SessionPromptModal';
import { useSession } from './hooks/useSession';
import { useTextSelection } from './hooks/useTextSelection';
import * as api from './api/client';
import type { Attachment, CopySource } from './api/client';

export default function App() {
  const {
    session,
    messages,
    files,
    streaming,
    streamingParts,
    startSession,
    loadSession,
    clearSession,
    stopStreaming,
    send,
    refreshFiles,
    writingFile,
  } = useSession();
  const { handleSelection } = useTextSelection();

  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [pastSessions, setPastSessions] = useState<api.Session[]>([]);
  const [fileContent, setFileContent] = useState('');
  const [milestonesContent, setMilestonesContent] = useState('');

  // Attachments (file refs + quotes) for the chat input
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const copySourceRef = useRef<CopySource | null>(null);

  const [editingSessionPrompt, setEditingSessionPrompt] = useState(false);
  const [fileTreeWidth, setFileTreeWidth] = useState(208);
  const [chatWidth, setChatWidth] = useState(384);

  const handleFileTreeResize = useCallback((delta: number) => {
    setFileTreeWidth((w) => Math.min(400, Math.max(120, w + delta)));
  }, []);

  const handleChatResize = useCallback((delta: number) => {
    setChatWidth((w) => Math.min(600, Math.max(280, w - delta)));
  }, []);

  const addAttachment = useCallback((att: Attachment) => {
    setAttachments((prev) => [...prev, att]);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  // Track copy source when copying from the editor
  const handleEditorCopy = useCallback(() => {
    if (!activeFile) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const selectedText = sel.toString().trim();
    if (!selectedText) return;

    const selStart = fileContent.indexOf(selectedText);
    if (selStart === -1) return;

    const beforeSel = fileContent.slice(0, selStart);
    const startLine = beforeSel.split('\n').length;
    const endLine = startLine + selectedText.split('\n').length - 1;

    copySourceRef.current = { file: activeFile, startLine, endLine, text: selectedText };
  }, [activeFile, fileContent]);

  // Load file content when active file changes
  useEffect(() => {
    if (!session || !activeFile) return;
    api
      .readFile(session.id, activeFile)
      .then((res) => {
        setFileContent(res.content);
      })
      .catch(() => setFileContent(''));
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
    api
      .readFile(session.id, 'milestones.md')
      .then((res) => {
        setMilestonesContent(res.content);
      })
      .catch(() => {});
  }, [session, files]);

  // Reload active file content when files list changes (Teacher may have updated it)
  useEffect(() => {
    if (!session || !activeFile || !files.includes(activeFile)) return;
    api
      .readFile(session.id, activeFile)
      .then((res) => {
        setFileContent(res.content);
      })
      .catch(() => {});
  }, [files]);

  const handleCreateFile = useCallback(
    async (name: string) => {
      if (!session) return;
      await api.writeFile(session.id, name, `# ${name.replace('.md', '')}\n\n`);
      refreshFiles();
      setActiveFile(name);
    },
    [session, refreshFiles],
  );

  const handleDeleteFile = useCallback(
    async (name: string) => {
      if (!session) return;
      await api.deleteFile(session.id, name);
      if (activeFile === name) setActiveFile(null);
      refreshFiles();
    },
    [session, activeFile, refreshFiles],
  );

  const handleSaveFile = useCallback(
    async (content: string) => {
      if (!session || !activeFile) return;
      await api.writeFile(session.id, activeFile, content);
      setFileContent(content);
    },
    [session, activeFile],
  );

  const handleReferenceClick = useCallback(
    (file: string) => {
      if (files.includes(file)) {
        setActiveFile(file);
      }
    },
    [files],
  );

  // Load past sessions on mount and when returning to landing page
  useEffect(() => {
    if (!session) {
      api
        .getSessions()
        .then(setPastSessions)
        .catch(() => {});
    }
  }, [session]);

  const handleLoadSession = async (id: string) => {
    await loadSession(id);
    setActiveFile(null);
  };

  // No session: show landing page
  if (!session) {
    return <LandingPage sessions={pastSessions} onStart={startSession} onLoadSession={handleLoadSession} />;
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
          <button
            onClick={() => setEditingSessionPrompt(true)}
            className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-0.5 border border-zinc-700 rounded hover:border-zinc-500 transition-colors"
          >
            教学指令
          </button>
        </div>
      </div>

      {/* Main workspace */}
      <div className="flex-1 flex min-h-0">
        {/* File Tree */}
        <div className="flex-shrink-0 border-r border-zinc-800" style={{ width: fileTreeWidth }}>
          <FileTree
            files={files}
            activeFile={activeFile}
            onSelect={setActiveFile}
            onCreate={handleCreateFile}
            onDelete={handleDeleteFile}
          />
        </div>

        <ResizeHandle onResize={handleFileTreeResize} />

        {/* Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <MilestoneBar content={milestonesContent} />
          {activeFile ? (
            <div className="flex-1 min-h-0">
              <MarkdownEditor
                fileName={activeFile}
                content={fileContent}
                isWriting={writingFile === activeFile}
                onSave={handleSaveFile}
                onMouseUp={() => handleSelection(activeFile, fileContent)}
                onCopy={handleEditorCopy}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
              等待 Teacher 生成文件...
            </div>
          )}
        </div>

        <ResizeHandle onResize={handleChatResize} />

        {/* Chat Panel */}
        <div className="flex-shrink-0 border-l border-zinc-800" style={{ width: chatWidth }}>
          <ChatPanel
            messages={messages}
            streaming={streaming}
            streamingParts={streamingParts}
            attachments={attachments}
            onRemoveAttachment={removeAttachment}
            onClearAttachments={clearAttachments}
            onAddAttachment={addAttachment}
            copySource={copySourceRef}
            onSend={send}
            onStop={stopStreaming}
            onReferenceClick={handleReferenceClick}
          />
        </div>
      </div>

      {editingSessionPrompt && session && (
        <SessionPromptModal
          sessionId={session.id}
          open={editingSessionPrompt}
          onClose={() => setEditingSessionPrompt(false)}
        />
      )}

      <SelectionPopup
        onAsk={(selectedText) => {
          // Try to map DOM selection to a file reference
          const fileRef = activeFile ? handleSelection(activeFile, fileContent) : null;
          if (fileRef) {
            addAttachment({
              type: 'file-ref',
              file: fileRef.fileName,
              startLine: fileRef.startLine,
              endLine: fileRef.endLine,
              preview: selectedText.slice(0, 100),
            });
          } else {
            addAttachment({ type: 'quote', text: selectedText });
          }
        }}
      />
    </div>
  );
}
