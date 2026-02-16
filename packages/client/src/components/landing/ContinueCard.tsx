import { useState, useEffect } from 'react';
import type { Session, MilestoneProgress } from '../../api/client';
import * as api from '../../api/client';

interface Props {
  session: Session;
  onResume: (id: string) => void;
}

export default function ContinueCard({ session, onResume }: Props) {
  const [progress, setProgress] = useState<MilestoneProgress | null>(null);

  useEffect(() => {
    api
      .getSessionMilestones(session.id)
      .then(setProgress)
      .catch(() => setProgress(null));
  }, [session.id]);

  const pct = progress && progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

  return (
    <button onClick={() => onResume(session.id)} className="w-full text-left group">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 hover:bg-zinc-800/80 hover:border-zinc-700 transition-all duration-200">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
            {session.concept}
          </span>
          <span className="text-xs text-zinc-600">
            {new Date(session.createdAt).toLocaleDateString('zh-CN', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>

        {progress && progress.total > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-zinc-500 tabular-nums shrink-0">
              {progress.completed}/{progress.total}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}
