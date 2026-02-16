export interface FileReference {
  file: string;
  startLine?: number;
  endLine?: number;
}

const REFERENCE_REGEX = /\[([^[\]\s:]+\.\w+)(?::(\d+):(\d+))?\]/g;

export function parseReferences(text: string): FileReference[] {
  const refs: FileReference[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(REFERENCE_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    refs.push({
      file: match[1],
      startLine: match[2] !== undefined ? parseInt(match[2], 10) : undefined,
      endLine: match[3] !== undefined ? parseInt(match[3], 10) : undefined,
    });
  }
  return refs;
}

export function generateReference(ref: FileReference): string {
  if (ref.startLine !== undefined && ref.endLine !== undefined) {
    return `[${ref.file}:${ref.startLine}:${ref.endLine}]`;
  }
  return `[${ref.file}]`;
}
