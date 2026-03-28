import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/client';

const DEFAULT_DRAFT: api.SessionDraftResponse = {
  manifest: {
    version: 1,
    profileSelection: { mode: 'inherit_all' },
    enabledTools: ['read_file', 'write_file', 'fetch_url'],
  },
  sessionPrompt: '',
};

export function useSessionDraft() {
  const [draft, setDraft] = useState<api.SessionDraftResponse>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.getSessionDraft();
      setDraft(next);
      return next;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '加载 Session Draft 失败';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const save = useCallback(async (nextDraft: api.SessionDraftResponse) => {
    setLoading(true);
    setError(null);
    try {
      const saved = await api.updateSessionDraft(nextDraft);
      setDraft(saved);
      return saved;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '保存 Session Draft 失败';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    draft,
    setDraft,
    loading,
    error,
    refresh,
    save,
  };
}
