export interface ProfileBlock {
  id: string;
  name: string;
  content: string;
}

export function parseProfileBlocks(content: string): ProfileBlock[] {
  if (!content.trim()) return [];
  const blocks: ProfileBlock[] = [];
  const lines = content.split('\n');
  let currentName = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#\s+(.+)$/);
    if (headingMatch) {
      if (currentName) {
        blocks.push({
          id: currentName,
          name: currentName,
          content: currentLines.join('\n').trim(),
        });
      }
      currentName = headingMatch[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentName) {
    blocks.push({
      id: currentName,
      name: currentName,
      content: currentLines.join('\n').trim(),
    });
  }
  return blocks;
}
