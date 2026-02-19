import { useState, useEffect, useCallback, useRef } from 'react';
import FileTree from './components/FileTree';
import MarkdownEditor from './components/MarkdownEditor';
import ChatPanel from './components/ChatPanel';
import type { ChatPanelHandle } from './components/ChatPanel';
import MilestoneBar from './components/MilestoneBar';
import SelectionPopup from './components/SelectionPopup';
import ResizeHandle from './components/ResizeHandle';
import LandingPage from './components/landing/LandingPage';
import SessionPromptModal from './components/SessionPromptModal';
import { useSession } from './hooks/useSession';
import { useTextSelection, getSourceLineFromNode } from './hooks/useTextSelection';
import * as api from './api/client';
import type { CopySource } from './api/client';

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
    failedMessage,
    retrySend,
  } = useSession();
  const { handleSelection } = useTextSelection();

  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [pastSessions, setPastSessions] = useState<api.Session[]>([]);
  const [fileContent, setFileContent] = useState('');
  const [milestonesContent, setMilestonesContent] = useState('');

  const copySourceRef = useRef<CopySource | null>(null);
  const chatPanelRef = useRef<ChatPanelHandle>(null);

  const [editingSessionPrompt, setEditingSessionPrompt] = useState(false);
  const [fileTreeWidth, setFileTreeWidth] = useState(208);
  const [chatWidth, setChatWidth] = useState(384);

  const fileTreeRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const fileTreeWidthRef = useRef(208);
  const chatWidthRef = useRef(384);

  const handleFileTreeResize = useCallback((delta: number) => {
    const w = Math.min(400, Math.max(120, fileTreeWidthRef.current + delta));
    fileTreeWidthRef.current = w;
    if (fileTreeRef.current) fileTreeRef.current.style.width = `${w}px`;
  }, []);
  const handleFileTreeResizeEnd = useCallback(() => {
    setFileTreeWidth(fileTreeWidthRef.current);
  }, []);

  const handleChatResize = useCallback((delta: number) => {
    const w = Math.min(600, Math.max(280, chatWidthRef.current - delta));
    chatWidthRef.current = w;
    if (chatRef.current) chatRef.current.style.width = `${w}px`;
  }, []);
  const handleChatResizeEnd = useCallback(() => {
    setChatWidth(chatWidthRef.current);
  }, []);

  const handleEditorCopy = useCallback(() => {
    if (!activeFile) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const selectedText = sel.toString().trim();
    if (!selectedText) return;

    const anchorLine = sel.anchorNode ? getSourceLineFromNode(sel.anchorNode) : null;
    const focusLine = sel.focusNode ? getSourceLineFromNode(sel.focusNode) : null;
    if (!anchorLine && !focusLine) return;

    const startLine = Math.min(anchorLine?.start ?? Infinity, focusLine?.start ?? Infinity);
    const endLine = Math.max(anchorLine?.end ?? 0, focusLine?.end ?? 0);

    copySourceRef.current = { file: activeFile, startLine, endLine, text: selectedText };
  }, [activeFile]);

  useEffect(() => {
    if (!session || !activeFile || !files.includes(activeFile)) return;
    let stale = false;
    api
      .readFile(session.id, activeFile)
      .then((res) => {
        if (!stale) setFileContent(res.content);
      })
      .catch(() => {
        if (!stale) setFileContent('');
      });
    return () => {
      stale = true;
    };
  }, [session, activeFile, files]);

  useEffect(() => {
    if (files.length > 0 && !activeFile) {
      const guidance = files.find((f) => f === 'guidance.md');
      setActiveFile(guidance ?? files[0]);
    }
  }, [files, activeFile]);

  useEffect(() => {
    if (!session || !files.includes('milestones.md')) return;
    let stale = false;
    api
      .readFile(session.id, 'milestones.md')
      .then((res) => {
        if (!stale) setMilestonesContent(res.content);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [session, files]);

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

  if (!session) {
    return <LandingPage sessions={pastSessions} onStart={startSession} onLoadSession={handleLoadSession} />;
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950">
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

      <div className="flex-1 flex min-h-0">
        <div ref={fileTreeRef} className="flex-shrink-0 border-r border-zinc-800" style={{ width: fileTreeWidth }}>
          <FileTree
            files={files}
            activeFile={activeFile}
            onSelect={setActiveFile}
            onCreate={handleCreateFile}
            onDelete={handleDeleteFile}
          />
        </div>

        <ResizeHandle onResize={handleFileTreeResize} onResizeEnd={handleFileTreeResizeEnd} />

        <div className="flex-1 flex flex-col min-w-0">
          <MilestoneBar content={milestonesContent} />
          {activeFile ? (
            <div className="flex-1 min-h-0">
              <MarkdownEditor
                fileName={activeFile}
                content={fileContent}
                isWriting={writingFile === activeFile}
                onSave={handleSaveFile}
                onMouseUp={() => handleSelection(activeFile)}
                onCopy={handleEditorCopy}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
              等待 Teacher 生成文件...
            </div>
          )}
        </div>

        <ResizeHandle onResize={handleChatResize} onResizeEnd={handleChatResizeEnd} />

        <div ref={chatRef} className="flex-shrink-0 border-l border-zinc-800" style={{ width: chatWidth }}>
          <ChatPanel
            ref={chatPanelRef}
            messages={messages}
            streaming={streaming}
            streamingParts={streamingParts}
            copySource={copySourceRef}
            onSend={send}
            onStop={stopStreaming}
            onReferenceClick={handleReferenceClick}
            failedMessage={failedMessage}
            onRetry={retrySend}
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
          const fileRef = activeFile ? handleSelection(activeFile) : null;
          if (fileRef) {
            chatPanelRef.current?.insertReference({
              file: fileRef.fileName,
              startLine: fileRef.startLine,
              endLine: fileRef.endLine,
              preview: selectedText.slice(0, 100),
            });
          } else {
            chatPanelRef.current?.insertText(`> ${selectedText.replace(/\n/g, '\n> ')}\n\n`);
          }
        }}
      />
    </div>
  );
}
