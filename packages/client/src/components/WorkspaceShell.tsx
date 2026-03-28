import { useCallback, useEffect, useRef, useState } from 'react';
import FileTree from './FileTree';
import MarkdownEditor from './MarkdownEditor';
import ChatPanel from './ChatPanel';
import type { ChatPanelHandle } from './ChatPanel';
import MilestoneBar from './MilestoneBar';
import SelectionPopup from './SelectionPopup';
import ResizeHandle from './ResizeHandle';
import SessionPromptModal from './SessionPromptModal';
import SessionToolsModal from './SessionToolsModal';
import ContextPreviewModal from './ContextPreviewModal';
import { useTextSelection, getSourceLineFromNode } from '../hooks/useTextSelection';
import * as api from '../api/client';
import type { CopySource } from '../api/client';

interface Props {
  session: api.Session;
  messages: api.ChatMessage[];
  files: string[];
  streaming: boolean;
  streamingParts: api.MessagePart[];
  writingFile: string | null;
  failedMessage: { message: string } | null;
  hasMoreHistory: boolean;
  loadingOlder: boolean;
  historyError: string | null;
  onSend: (message: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onLoadOlder: () => Promise<boolean>;
  onClearSession: () => void;
  onRefreshFiles: () => Promise<void>;
}

export default function WorkspaceShell({
  session,
  messages,
  files,
  streaming,
  streamingParts,
  writingFile,
  failedMessage,
  hasMoreHistory,
  loadingOlder,
  historyError,
  onSend,
  onStop,
  onRetry,
  onLoadOlder,
  onClearSession,
  onRefreshFiles,
}: Props) {
  const { handleSelection } = useTextSelection();
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [milestonesContent, setMilestonesContent] = useState('');
  const [editingSessionPrompt, setEditingSessionPrompt] = useState(false);
  const [editingSessionTools, setEditingSessionTools] = useState(false);
  const [viewingContextMemory, setViewingContextMemory] = useState(false);
  const [fileTreeWidth, setFileTreeWidth] = useState(208);
  const [chatWidth, setChatWidth] = useState(384);

  const copySourceRef = useRef<CopySource | null>(null);
  const chatPanelRef = useRef<ChatPanelHandle>(null);
  const fileTreeRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const fileTreeWidthRef = useRef(208);
  const chatWidthRef = useRef(384);

  const handleFileTreeResize = useCallback((delta: number) => {
    const width = Math.min(400, Math.max(120, fileTreeWidthRef.current + delta));
    fileTreeWidthRef.current = width;
    if (fileTreeRef.current) fileTreeRef.current.style.width = `${width}px`;
  }, []);

  const handleChatResize = useCallback((delta: number) => {
    const width = Math.min(600, Math.max(280, chatWidthRef.current - delta));
    chatWidthRef.current = width;
    if (chatRef.current) chatRef.current.style.width = `${width}px`;
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
    if (!activeFile || !files.includes(activeFile)) return;
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
  }, [activeFile, files, session.id]);

  useEffect(() => {
    if (files.length > 0 && !activeFile) {
      const guidance = files.find((file) => file === 'guidance.md');
      setActiveFile(guidance ?? files[0]);
    }
  }, [files, activeFile]);

  useEffect(() => {
    if (!files.includes('milestones.md')) {
      setMilestonesContent('');
      return;
    }
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
  }, [files, session.id]);

  const handleCreateFile = useCallback(
    async (name: string) => {
      await api.writeFile(session.id, name, `# ${name.replace('.md', '')}\n\n`);
      await onRefreshFiles();
      setActiveFile(name);
    },
    [onRefreshFiles, session.id],
  );

  const handleDeleteFile = useCallback(
    async (name: string) => {
      await api.deleteFile(session.id, name);
      if (activeFile === name) setActiveFile(null);
      await onRefreshFiles();
    },
    [activeFile, onRefreshFiles, session.id],
  );

  const handleSaveFile = useCallback(
    async (content: string) => {
      if (!activeFile) return;
      await api.writeFile(session.id, activeFile, content);
      setFileContent(content);
    },
    [activeFile, session.id],
  );

  const handleReferenceClick = useCallback(
    (file: string) => {
      if (files.includes(file)) setActiveFile(file);
    },
    [files],
  );

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onClearSession} className="text-zinc-400 hover:text-white text-sm flex items-center gap-1">
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
          <button
            onClick={() => setEditingSessionTools(true)}
            className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-0.5 border border-zinc-700 rounded hover:border-zinc-500 transition-colors"
          >
            工具
          </button>
          <button
            onClick={() => setViewingContextMemory(true)}
            className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-0.5 border border-zinc-700 rounded hover:border-zinc-500 transition-colors"
          >
            模型记忆
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

        <ResizeHandle onResize={handleFileTreeResize} onResizeEnd={() => setFileTreeWidth(fileTreeWidthRef.current)} />

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
            <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">等待 Teacher 生成文件...</div>
          )}
        </div>

        <ResizeHandle onResize={handleChatResize} onResizeEnd={() => setChatWidth(chatWidthRef.current)} />

        <div ref={chatRef} className="flex-shrink-0 border-l border-zinc-800" style={{ width: chatWidth }}>
          <ChatPanel
            ref={chatPanelRef}
            messages={messages}
            streaming={streaming}
            streamingParts={streamingParts}
            copySource={copySourceRef}
            onSend={onSend}
            onStop={onStop}
            onReferenceClick={handleReferenceClick}
            failedMessage={failedMessage}
            onRetry={onRetry}
            hasMoreHistory={hasMoreHistory}
            loadingOlder={loadingOlder}
            historyError={historyError}
            onLoadOlder={onLoadOlder}
          />
        </div>
      </div>

      {editingSessionPrompt && (
        <SessionPromptModal sessionId={session.id} open={editingSessionPrompt} onClose={() => setEditingSessionPrompt(false)} />
      )}

      {editingSessionTools && (
        <SessionToolsModal sessionId={session.id} open={editingSessionTools} onClose={() => setEditingSessionTools(false)} />
      )}

      {viewingContextMemory && (
        <ContextPreviewModal
          open={viewingContextMemory}
          onClose={() => setViewingContextMemory(false)}
          title="模型记忆"
          description="当前这次对话真正带进模型的内容，都按实际顺序摊开在这里。"
          fetchPreview={() => api.getSessionContextMemory(session.id)}
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
            chatPanelRef.current?.insertQuote(selectedText);
          }
        }}
      />
    </div>
  );
}
