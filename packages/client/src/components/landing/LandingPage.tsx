import { useState } from 'react';
import type { Session } from '../../api/client';
import SessionSidebar from './SessionSidebar';
import ContinueCard from './ContinueCard';
import SettingsCards from './SettingsCards';
import ProfileModal from './ProfileModal';
import SystemPromptModal from './SystemPromptModal';
import SessionPromptDraftModal from './SessionPromptDraftModal';
import LLMConfigModal from './LLMConfigModal';

interface Props {
  sessions: Session[];
  onStart: (concept: string) => void;
  onLoadSession: (id: string) => void;
}

export default function LandingPage({ sessions, onStart, onLoadSession }: Props) {
  const [conceptInput, setConceptInput] = useState('');
  const [modal, setModal] = useState<'profile' | 'system-prompt' | 'session-prompt' | 'llm' | null>(null);

  const handleStart = () => {
    const concept = conceptInput.trim();
    if (!concept) return;
    onStart(concept);
    setConceptInput('');
  };

  const latestSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  return (
    <div className="h-full bg-zinc-950 flex">
      {/* Sidebar */}
      <SessionSidebar sessions={sessions} onSelect={onLoadSession} />

      {/* Main area */}
      <div className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="w-full max-w-lg px-6 py-12">
          {/* Brand header */}
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 to-zinc-400 mb-1">
            Teacher Agent
          </h1>
          <p className="text-zinc-500 text-sm mb-8">AI 驱动的结构化学习工具</p>

          {/* Concept input */}
          <div className="flex gap-2 mb-8">
            <textarea
              autoFocus
              rows={2}
              value={conceptInput}
              onChange={(e) => setConceptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleStart();
                }
              }}
              placeholder="描述你想学的、想问的..."
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3.5 text-white placeholder-zinc-600 outline-none focus:border-zinc-600 focus:shadow-[0_0_0_3px_rgba(63,63,70,0.3)] transition-all resize-none"
            />
            <button
              onClick={handleStart}
              disabled={!conceptInput.trim()}
              className="px-6 py-3.5 bg-zinc-200 hover:bg-white disabled:opacity-30 text-zinc-900 rounded-xl font-medium text-sm transition-all"
            >
              开始
            </button>
          </div>

          {/* Settings */}
          <div className="mb-6">
            <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2.5">设置</p>
            <SettingsCards
              onOpenProfile={() => setModal('profile')}
              onOpenSystemPrompt={() => setModal('system-prompt')}
              onOpenSessionPrompt={() => setModal('session-prompt')}
              onOpenLLM={() => setModal('llm')}
            />
          </div>

          {/* Continue learning */}
          {latestSession && (
            <div>
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2.5">继续学习</p>
              <ContinueCard session={latestSession} onResume={onLoadSession} />
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <ProfileModal open={modal === 'profile'} onClose={() => setModal(null)} />
      <SystemPromptModal open={modal === 'system-prompt'} onClose={() => setModal(null)} />
      <SessionPromptDraftModal open={modal === 'session-prompt'} onClose={() => setModal(null)} />
      <LLMConfigModal open={modal === 'llm'} onClose={() => setModal(null)} />
    </div>
  );
}
