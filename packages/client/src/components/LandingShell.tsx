import LandingPage from './landing/LandingPage';
import type { Session, SessionDraftResponse } from '../api/client';

interface Props {
  sessions: Session[];
  onStart: (concept: string) => void;
  onLoadSession: (id: string) => void;
  draft: SessionDraftResponse;
  onSaveDraft: (draft: SessionDraftResponse) => Promise<unknown>;
}

export default function LandingShell({ sessions, onStart, onLoadSession, draft, onSaveDraft }: Props) {
  return (
    <LandingPage
      sessions={sessions}
      onStart={onStart}
      onLoadSession={onLoadSession}
      draft={draft}
      onSaveDraft={onSaveDraft}
    />
  );
}
