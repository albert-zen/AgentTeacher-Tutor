// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import LandingPage from '../src/components/landing/LandingPage';
import type { SessionDraftResponse } from '../src/api/client';

const mockGetLLMStatus = vi.fn();
const mockGetTools = vi.fn();
const mockGetTemplateContextPreview = vi.fn();

vi.mock('../src/api/client', async () => {
  const actual = await vi.importActual<object>('../src/api/client');
  return {
    ...actual,
    getLLMStatus: (...args: unknown[]) => mockGetLLMStatus(...args),
    getTools: (...args: unknown[]) => mockGetTools(...args),
    getTemplateContextPreview: (...args: unknown[]) => mockGetTemplateContextPreview(...args),
  };
});

describe('LandingPage context preview entry', () => {
  const draft: SessionDraftResponse = {
    manifest: {
      version: 1 as const,
      profileSelection: { mode: 'inherit_all' as const },
      enabledTools: ['read_file', 'write_file', 'fetch_url'],
    },
    sessionPrompt: '',
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockGetLLMStatus.mockResolvedValue({
      configured: true,
      provider: 'dashscope',
      model: 'glm-4.7',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
    mockGetTools.mockResolvedValue({
      tools: [
        {
          id: 'read_file',
          label: '读文件',
          description: '读取当前 Session 工作区中的文件或行范围。',
          enabled: true,
        exposeToModel: true,
        uiVisible: true,
        runtimeMode: 'builtin',
        status: 'ready',
        config: { runtimeMode: 'builtin' },
      },
    ],
    globalConfig: {
      version: 1,
      tools: {
        read_file: { runtimeMode: 'builtin' },
        write_file: { runtimeMode: 'builtin' },
        fetch_url: { runtimeMode: 'builtin' },
        web_search: {
          runtimeMode: 'local',
          localProvider: 'duckduckgo',
          sidecar: { port: 18080 },
            backend: { port: 18081 },
            externalBaseURL: 'http://127.0.0.1:8080',
            timeoutMs: 8000,
            defaultMaxResults: 5,
            allowedCategories: ['general', 'it', 'science', 'news'],
          allowedEngines: [],
          persistResultsByDefault: false,
        },
        browser: { runtimeMode: 'managed' },
      },
    },
    manifest: draft.manifest,
  });
    mockGetTemplateContextPreview.mockResolvedValue({
      sections: [
        {
          id: 'system-prompt',
          kind: 'system_prompt',
          title: '系统提示词',
          summary: 'Teacher Agent...',
          order: 1,
          content: 'Teacher Agent...',
        },
      ],
    });
  });

  it('opens template context preview from the landing page', async () => {
    render(<LandingPage sessions={[]} onStart={() => {}} onLoadSession={() => {}} draft={draft} onSaveDraft={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /上下文预览/i }));

    await waitFor(() => {
      expect(screen.getByText('系统提示词')).toBeTruthy();
      expect(mockGetTemplateContextPreview).toHaveBeenCalled();
    });
  });
});
