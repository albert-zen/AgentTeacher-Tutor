import type { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { FileRef } from '../api/client';

export const REF_PATTERN = /\[([^[\]\s:]+\.\w+)(?::(\d+):(\d+))?\]/g.source;

/** Extract FileRef[] from text containing [file:start:end] patterns */
export function extractReferencesFromText(text: string): FileRef[] {
  const refs: FileRef[] = [];
  const re = new RegExp(REF_PATTERN, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    refs.push({
      file: m[1],
      startLine: m[2] !== undefined ? parseInt(m[2], 10) : undefined,
      endLine: m[3] !== undefined ? parseInt(m[3], 10) : undefined,
    });
  }
  return refs;
}

export function serializeEditorContent(editor: Editor): string {
  const doc = editor.state.doc;
  const paragraphs: string[] = [];

  doc.forEach((block: ProseMirrorNode) => {
    if (block.type.name === 'paragraph') {
      let line = '';
      block.forEach((child: ProseMirrorNode) => {
        if (child.type.name === 'referenceChip') {
          const { file, startLine, endLine } = child.attrs;
          line += `[${file}:${startLine}:${endLine}]`;
        } else if (child.type.name === 'quoteChip') {
          const quoted = (child.attrs.text as string).replace(/\n/g, '\n> ');
          if (line) paragraphs.push(line);
          paragraphs.push(`> ${quoted}`);
          paragraphs.push('');
          line = '';
        } else if (child.isText) {
          line += child.text ?? '';
        } else if (child.type.name === 'hardBreak') {
          paragraphs.push(line);
          line = '';
        }
      });
      paragraphs.push(line);
    }
  });

  return paragraphs.join('\n').trim();
}
