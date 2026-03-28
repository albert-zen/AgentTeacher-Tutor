// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ProfileModal from '../src/components/landing/ProfileModal';

const mockGetProfile = vi.fn();
const mockGetProfileBlocks = vi.fn();
const mockGetSessionTemplateConfig = vi.fn();
const mockUpdateProfile = vi.fn();
const mockUpdateSessionTemplateConfig = vi.fn();

vi.mock('../src/api/client', () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
  getProfileBlocks: (...args: unknown[]) => mockGetProfileBlocks(...args),
  getSessionTemplateConfig: (...args: unknown[]) => mockGetSessionTemplateConfig(...args),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
  updateSessionTemplateConfig: (...args: unknown[]) => mockUpdateSessionTemplateConfig(...args),
}));

describe('ProfileModal', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockGetProfile.mockResolvedValue({ content: '# 背景\n前端\n# 目标\n理解上下文', totalLines: 4 });
    mockGetProfileBlocks.mockResolvedValue([
      { id: '背景', name: '背景', content: '前端' },
      { id: '目标', name: '目标', content: '理解上下文' },
    ]);
    mockGetSessionTemplateConfig.mockResolvedValue({ profileBlockIds: ['目标'] });
    mockUpdateProfile.mockResolvedValue(undefined);
    mockUpdateSessionTemplateConfig.mockResolvedValue({ profileBlockIds: ['背景', '目标'] });
  });

  it('loads and saves landing draft profile block selection', async () => {
    render(<ProfileModal open onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: '分块' }));

    const checkboxes = await screen.findAllByRole('checkbox');
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);

    fireEvent.click(checkboxes[0]);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mockUpdateSessionTemplateConfig).toHaveBeenCalledWith({ profileBlockIds: ['背景', '目标'] });
    });
  });
});
