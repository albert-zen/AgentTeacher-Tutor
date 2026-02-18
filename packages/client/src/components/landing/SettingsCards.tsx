import { useState, useEffect } from 'react';
import * as api from '../../api/client';
import type { LLMStatus } from '../../api/client';

interface Props {
  onOpenProfile: () => void;
  onOpenSystemPrompt: () => void;
  onOpenSessionPrompt: () => void;
  onOpenLLM: () => void;
}

export default function SettingsCards({ onOpenProfile, onOpenSystemPrompt, onOpenSessionPrompt, onOpenLLM }: Props) {
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);

  useEffect(() => {
    api
      .getLLMStatus()
      .then(setLlmStatus)
      .catch(() => {});
  }, []);

  return (
    <div className="grid grid-cols-4 gap-2">
      <CardButton onClick={onOpenProfile}>
        <CardLabel sub="Profile">学员档案</CardLabel>
      </CardButton>

      <CardButton onClick={onOpenSystemPrompt}>
        <CardLabel sub="System Prompt">教师指令</CardLabel>
      </CardButton>

      <CardButton onClick={onOpenSessionPrompt}>
        <CardLabel sub="Session Prompt">教学指令</CardLabel>
      </CardButton>

      <CardButton onClick={onOpenLLM}>
        <div className="flex items-center justify-between">
          <CardLabel sub={llmStatus?.model ?? '...'}>模型</CardLabel>
          {llmStatus && (
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${llmStatus.configured ? 'bg-emerald-400 shadow-[0_0_6px_theme(--color-emerald-400)]' : 'bg-red-400 shadow-[0_0_6px_theme(--color-red-400)]'}`}
            />
          )}
        </div>
      </CardButton>
    </div>
  );
}

function CardButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3.5 transition-all duration-200"
    >
      {children}
    </button>
  );
}

function CardLabel({ sub, children }: { sub: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm text-zinc-300">{children}</div>
      <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>
    </div>
  );
}
