import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveSystemPrompt } from './llm.js';
import { parseProfileBlocks, type ProfileBlock } from './profileParser.js';

export interface ContextConfig {
  profileBlockIds?: string[];
}

export interface AssembledContext {
  systemPrompt: string;
  profileBlocks: ProfileBlock[];
  selectedProfileContent: string;
}

export function assembleContext(dataDir: string, sessionId: string, config?: ContextConfig): AssembledContext {
  const systemPrompt = resolveSystemPrompt(dataDir, sessionId);

  let profileBlocks: ProfileBlock[] = [];
  const profilePath = join(dataDir, 'profile.md');
  if (existsSync(profilePath)) {
    const content = readFileSync(profilePath, 'utf-8');
    profileBlocks = parseProfileBlocks(content);
  }

  let selectedBlocks = profileBlocks;
  if (config?.profileBlockIds && config.profileBlockIds.length > 0) {
    selectedBlocks = profileBlocks.filter((b) => config.profileBlockIds!.includes(b.id));
  }

  const selectedProfileContent =
    selectedBlocks.length > 0 ? selectedBlocks.map((b) => `## ${b.name}\n${b.content}`).join('\n\n') : '';

  return { systemPrompt, profileBlocks, selectedProfileContent };
}
