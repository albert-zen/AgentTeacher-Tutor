// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import LandingPage from '../src/components/landing/LandingPage';

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
          config: { enabledByDefault: true, runtimeMode: 'builtin' },
          sessionOverride: null,
        },
      ],
      globalConfig: {
        version: 1,
        tools: {
          read_file: { enabledByDefault: true, runtimeMode: 'builtin' },
          write_file: { enabledByDefault: true, runtimeMode: 'builtin' },
          fetch_url: { enabledByDefault: true, runtimeMode: 'builtin' },
          web_search: {
            enabledByDefault: false,
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
          browser: { enabledByDefault: false, runtimeMode: 'managed' },
        },
      },
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
    render(<LandingPage sessions={[]} onStart={() => {}} onLoadSession={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /上下文预览/i }));

    await waitFor(() => {
      expect(screen.getByText('系统提示词')).toBeTruthy();
      expect(mockGetTemplateContextPreview).toHaveBeenCalled();
    });
  });
});
