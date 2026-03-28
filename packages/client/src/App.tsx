import { useEffect, useState } from 'react';
import LandingShell from './components/LandingShell';
import WorkspaceShell from './components/WorkspaceShell';
import { useSession } from './hooks/useSession';
import { useSessionDraft } from './hooks/useSessionDraft';
import * as api from './api/client';

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
    hasMoreHistory,
    loadingOlder,
    historyError,
    loadOlderMessages,
  } = useSession();
  const { draft, save: saveDraft } = useSessionDraft();
  const [pastSessions, setPastSessions] = useState<api.Session[]>([]);

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
  };

  const handleClearSession = () => {
    clearSession();
  };

  if (!session) {
    return (
      <LandingShell
        sessions={pastSessions}
        onStart={startSession}
        onLoadSession={handleLoadSession}
        draft={draft}
        onSaveDraft={saveDraft}
      />
    );
  }

  return (
    <WorkspaceShell
      session={session}
      messages={messages}
      files={files}
      streaming={streaming}
      streamingParts={streamingParts}
      writingFile={writingFile}
      failedMessage={failedMessage}
      hasMoreHistory={hasMoreHistory}
      loadingOlder={loadingOlder}
      historyError={historyError}
      onSend={send}
      onStop={stopStreaming}
      onRetry={retrySend}
      onLoadOlder={loadOlderMessages}
      onClearSession={handleClearSession}
      onRefreshFiles={refreshFiles}
    />
  );
}
