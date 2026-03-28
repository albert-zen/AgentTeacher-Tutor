// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SearchConfigModal from '../src/components/landing/SearchConfigModal';
import SessionSearchConfigModal from '../src/components/SessionSearchConfigModal';

const mockGetTools = vi.fn();
const mockUpdateTool = vi.fn();
const mockRunToolRuntimeAction = vi.fn();
const mockGetSessionTools = vi.fn();
const mockUpdateSessionTool = vi.fn();

vi.mock('../src/api/client', () => ({
  getTools: (...args: unknown[]) => mockGetTools(...args),
  updateTool: (...args: unknown[]) => mockUpdateTool(...args),
  runToolRuntimeAction: (...args: unknown[]) => mockRunToolRuntimeAction(...args),
  getSessionTools: (...args: unknown[]) => mockGetSessionTools(...args),
  updateSessionTool: (...args: unknown[]) => mockUpdateSessionTool(...args),
}));

function makeToolsResponse() {
  return {
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
      {
        id: 'write_file',
        label: '写文件',
        description: '创建或修改当前 Session 工作区中的文件内容。',
        enabled: true,
        exposeToModel: true,
        uiVisible: true,
        runtimeMode: 'builtin',
        status: 'ready',
        config: { enabledByDefault: true, runtimeMode: 'builtin' },
        sessionOverride: null,
      },
      {
        id: 'web_search',
        label: '联网搜索',
        description: '为 Teacher 提供外部资料与最新信息检索能力。',
        enabled: true,
        exposeToModel: true,
        uiVisible: true,
        runtimeMode: 'managed',
        status: 'stopped',
        message: 'Sidecar unavailable: ECONNREFUSED',
        config: {
          enabledByDefault: true,
          runtimeMode: 'managed',
          sidecar: { port: 18080 },
          backend: { port: 18081 },
          upstream: { provider: 'searxng', remoteBaseURL: 'http://127.0.0.1:8080' },
          timeoutMs: 8000,
          defaultMaxResults: 5,
          allowedCategories: ['general', 'it', 'science', 'news'],
          allowedEngines: [],
          persistResultsByDefault: false,
        },
        sessionOverride: null,
      },
    ],
    globalConfig: {
      version: 1 as const,
      tools: {
        read_file: { enabledByDefault: true, runtimeMode: 'builtin' as const },
        write_file: { enabledByDefault: true, runtimeMode: 'builtin' as const },
        web_search: {
          enabledByDefault: true,
          runtimeMode: 'managed' as const,
          sidecar: { port: 18080 },
          backend: { port: 18081 },
          upstream: { provider: 'searxng' as const, remoteBaseURL: 'http://127.0.0.1:8080' },
          timeoutMs: 8000,
          defaultMaxResults: 5,
          allowedCategories: ['general', 'it', 'science', 'news'],
          allowedEngines: [],
          persistResultsByDefault: false,
        },
        browser: { enabledByDefault: false, runtimeMode: 'managed' as const },
      },
    },
  };
}

describe('Tools modals', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockGetTools.mockResolvedValue(makeToolsResponse());
    mockUpdateTool.mockResolvedValue(makeToolsResponse());
    mockRunToolRuntimeAction.mockResolvedValue(makeToolsResponse().tools[2]);
    mockGetSessionTools.mockResolvedValue({
      ...makeToolsResponse(),
      sessionConfig: { toolOverrides: { web_search: { enabled: false } } },
      tools: makeToolsResponse().tools.map((tool) =>
        tool.id === 'web_search' ? { ...tool, enabled: false, sessionOverride: { enabled: false } } : tool,
      ),
    });
    mockUpdateSessionTool.mockResolvedValue({
      ...makeToolsResponse(),
      sessionConfig: { toolOverrides: { web_search: { enabled: true } } },
    });
  });

  it('renders the global tools modal and triggers a runtime action', async () => {
    render(<SearchConfigModal open onClose={() => {}} />);

    expect(await screen.findByText('联网搜索')).toBeTruthy();
    expect(screen.getByText('Sidecar unavailable: ECONNREFUSED')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(mockRunToolRuntimeAction).toHaveBeenCalledWith('web_search', 'check');
  });

  it('renders the session tools modal and saves a session override', async () => {
    render(<SessionSearchConfigModal sessionId="session-1" open onClose={() => {}} />);

    expect(await screen.findByText('Session 工具')).toBeTruthy();
    expect((await screen.findAllByText('联网搜索')).length).toBeGreaterThan(0);

    const toggles = screen.getAllByRole('checkbox');
    fireEvent.click(toggles[0]);
    expect(mockUpdateSessionTool).toHaveBeenCalled();
  });
});
