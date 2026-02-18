export interface MilestoneItem {
  name: string;
  completed: boolean;
}

export interface Milestones {
  title: string;
  items: MilestoneItem[];
}

const TITLE_REGEX = /^#\s*里程碑:\s*(.+)$/m;
const ITEM_REGEX = /^-\s*\[([ xX])\]\s*(.+)$/m;

/**
 * Parse milestones.md content into structured data.
 */
export function parseMilestones(md: string): Milestones {
  let title = '';
  const items: MilestoneItem[] = [];

  const titleMatch = md.match(TITLE_REGEX);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  const itemMatches = md.matchAll(new RegExp(ITEM_REGEX.source, 'gm'));
  for (const match of itemMatches) {
    const checked = match[1];
    const name = match[2].trim();
    const completed = checked.toLowerCase() === 'x';
    items.push({ name, completed });
  }

  return { title, items };
}
