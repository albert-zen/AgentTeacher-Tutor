import { useState, useRef, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { FileRef, MessagePart, CopySource } from '../api/client';
import { ReferenceChip } from '../extensions/referenceChip';
import { QuoteChip } from '../extensions/quoteChip';
import { serializeEditorContent, REF_PATTERN } from '../utils/serializeEditor';
import MarkdownRenderer from './MarkdownRenderer';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  references?: FileRef[];
  toolEvents?: { type: string; toolName: string; args?: Record<string, unknown>; result?: unknown }[];
  parts?: MessagePart[];
}

interface Props {
  messages: Message[];
  streaming: boolean;
  streamingParts: MessagePart[];
  copySource: React.RefObject<CopySource | null>;
  onSend: (message: string) => void;
  onStop?: () => void;
  onReferenceClick?: (file: string, startLine?: number, endLine?: number) => void;
  failedMessage?: { message: string } | null;
  onRetry?: () => void;
}

export interface ChatPanelHandle {
  insertReference: (attrs: { file: string; startLine: number; endLine: number; preview: string }) => void;
  insertQuote: (text: string) => void;
  insertText: (text: string) => void;
}

function MessageContent({ content, onRefClick }: { content: string; onRefClick?: Props['onReferenceClick'] }) {
  const parts: (string | { file: string; start?: number; end?: number; raw: string })[] = [];
  let last = 0;
  const regex = new RegExp(REF_PATTERN, 'g');
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) parts.push(content.slice(last, match.index));
    parts.push({
      file: match[1],
      start: match[2] ? parseInt(match[2]) : undefined,
      end: match[3] ? parseInt(match[3]) : undefined,
      raw: match[0],
    });
    last = match.index + match[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));

  if (parts.length === 1 && typeof parts[0] === 'string') {
    return <MarkdownRenderer>{content}</MarkdownRenderer>;
  }

  return (
    <div>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <MarkdownRenderer key={i}>{part}</MarkdownRenderer>
        ) : (
          <button
            key={i}
            onClick={() => onRefClick?.(part.file, part.start, part.end)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-900/40 border border-blue-700/50 rounded text-blue-400 text-xs hover:bg-blue-800/40 mx-0.5"
          >
            {part.raw}
          </button>
        ),
      )}
    </div>
  );
}

function toolLabel(part: MessagePart & { type: 'tool-call' | 'tool-result' }): string {
  const path =
    part.type === 'tool-call' ? ((part.args as Record<string, unknown>)?.path as string | undefined) : undefined;
  if (part.type === 'tool-call') {
    if (part.toolName === 'read_file') return `Reading ${path ?? 'file'}...`;
    if (part.toolName === 'write_file') return `Writing ${path ?? 'file'}...`;
    return `${part.toolName}...`;
  }
  const resultPath = (part.result as Record<string, unknown>)?.data
    ? (((part.result as Record<string, unknown>).data as Record<string, unknown>)?.path as string | undefined)
    : undefined;
  if (part.toolName === 'read_file') return `Read ${resultPath ?? 'file'}`;
  if (part.toolName === 'write_file') return `Wrote ${resultPath ?? 'file'}`;
  return `${part.toolName} done`;
}

function ToolEventCard({ part }: { part: MessagePart & { type: 'tool-call' | 'tool-result' } }) {
  const [expanded, setExpanded] = useState(false);
  const isCall = part.type === 'tool-call';
  const icon = isCall ? (part.toolName === 'read_file' ? '\u{1F4D6}' : '\u{270F}\u{FE0F}') : '\u2713';

  return (
    <div className="my-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2 py-1 bg-zinc-700/50 border border-zinc-600/50 rounded text-xs text-zinc-400 hover:bg-zinc-700 w-full text-left"
      >
        <span>{icon}</span>
        <span className="flex-1 truncate">{toolLabel(part)}</span>
        <span className="text-zinc-500 text-[10px]">{expanded ? '\u25BE' : '\u25B8'}</span>
      </button>
      {expanded && (
        <pre className="mt-0.5 px-2 py-1 bg-zinc-800 rounded text-[10px] text-zinc-500 font-mono overflow-x-auto max-h-24 overflow-y-auto">
          {JSON.stringify(isCall ? part.args : part.result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ReferenceBadge({ fileRef, onClick }: { fileRef: FileRef; onClick?: Props['onReferenceClick'] }) {
  const label = fileRef.startLine ? `${fileRef.file}:${fileRef.startLine}:${fileRef.endLine}` : fileRef.file;
  return (
    <button
      onClick={() => onClick?.(fileRef.file, fileRef.startLine, fileRef.endLine)}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-900/40 border border-blue-700/50 rounded text-blue-400 text-xs hover:bg-blue-800/40"
    >
      [{label}]
    </button>
  );
}

function PartsRenderer({ parts, onRefClick }: { parts: MessagePart[]; onRefClick?: Props['onReferenceClick'] }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return part.content ? (
            <div key={i} className="prose prose-invert prose-sm max-w-none">
              <MessageContent content={part.content} onRefClick={onRefClick} />
            </div>
          ) : null;
        }
        return <ToolEventCard key={i} part={part} />;
      })}
    </>
  );
}

function LegacyRenderer({ msg, onRefClick }: { msg: Message; onRefClick?: Props['onReferenceClick'] }) {
  return (
    <>
      {msg.toolEvents && msg.toolEvents.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {msg.toolEvents.map((evt, i) => (
            <ToolEventCard key={i} part={evt as MessagePart & { type: 'tool-call' | 'tool-result' }} />
          ))}
        </div>
      )}
      {msg.content && (
        <div className="prose prose-invert prose-sm max-w-none">
          <MessageContent content={msg.content} onRefClick={onRefClick} />
        </div>
      )}
    </>
  );
}

const ChatPanel = forwardRef<ChatPanelHandle, Props>(function ChatPanel(
  { messages, streaming, streamingParts, copySource, onSend, onStop, onReferenceClick, failedMessage, onRetry },
  ref,
) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
        code: false,
      }),
      ReferenceChip,
      QuoteChip,
      Placeholder.configure({ placeholder: '输入消息...' }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'outline-none w-full min-h-[3rem] max-h-32 overflow-y-auto px-3 py-2 text-sm text-zinc-200',
      },
      handleKeyDown(_view, event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          handleSubmitRef.current();
          return true;
        }
        return false;
      },
      handlePaste(_view, event) {
        const source = copySource.current;
        if (!source) return false;

        const pastedText = event.clipboardData?.getData('text') ?? '';
        if (pastedText.trim() === source.text.trim()) {
          event.preventDefault();
          editorRef.current?.commands.insertContent({
            type: 'referenceChip',
            attrs: {
              file: source.file,
              startLine: source.startLine,
              endLine: source.endLine,
              preview: pastedText.slice(0, 100),
            },
          });
          copySource.current = null;
          return true;
        }
        return false;
      },
    },
  });

  const editorRef = useRef(editor);
  editorRef.current = editor;

  const handleSubmit = useCallback(() => {
    const ed = editorRef.current;
    if (!ed || streaming) return;
    const text = serializeEditorContent(ed);
    if (!text) return;
    onSend(text);
    ed.commands.clearContent();
  }, [streaming, onSend]);

  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  useImperativeHandle(
    ref,
    () => ({
      insertReference(attrs: { file: string; startLine: number; endLine: number; preview: string }) {
        editorRef.current?.commands.insertContent({
          type: 'referenceChip',
          attrs,
        });
        editorRef.current?.commands.focus();
      },
      insertQuote(text: string) {
        editorRef.current?.commands.insertContent({
          type: 'quoteChip',
          attrs: { text },
        });
        editorRef.current?.commands.focus();
      },
      insertText(text: string) {
        const html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        editorRef.current?.commands.insertContent(html);
        editorRef.current?.commands.focus();
      },
    }),
    [],
  );

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const threshold = 80;
    isNearBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingParts]);

  const isEmpty = !editor || editor.isEmpty;

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <div className="px-4 py-2 border-b border-zinc-800">
        <span className="text-sm font-semibold text-zinc-400">Teacher</span>
      </div>

      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {useMemo(
          () => (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                      msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-200'
                    }`}
                  >
                    {msg.role === 'user' && msg.references && msg.references.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {msg.references.map((r, i) => (
                          <ReferenceBadge key={i} fileRef={r} onClick={onReferenceClick} />
                        ))}
                      </div>
                    )}

                    {msg.role === 'assistant' ? (
                      msg.parts && msg.parts.length > 0 ? (
                        <PartsRenderer parts={msg.parts} onRefClick={onReferenceClick} />
                      ) : (
                        <LegacyRenderer msg={msg} onRefClick={onReferenceClick} />
                      )
                    ) : (
                      msg.content && (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <MessageContent content={msg.content} onRefClick={onReferenceClick} />
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}

              {streaming && streamingParts.length > 0 && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] px-3 py-2 rounded-lg text-sm bg-zinc-800 text-zinc-200">
                    <PartsRenderer parts={streamingParts} onRefClick={onReferenceClick} />
                    <div className="flex items-center gap-1.5 mt-1.5 text-zinc-400 animate-pulse">
                      <div className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                      <span className="text-xs">处理中</span>
                    </div>
                  </div>
                </div>
              )}
              {streaming && streamingParts.length === 0 && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 rounded-lg text-sm bg-zinc-800 text-zinc-400">
                    <span className="animate-pulse">思考中...</span>
                  </div>
                </div>
              )}
            </>
          ),
          [messages, streaming, streamingParts, onReferenceClick],
        )}
        <div ref={bottomRef} />
      </div>

      {failedMessage && (
        <div className="mx-4 mb-2 px-3 py-2 bg-red-950/50 border border-red-900/50 rounded-lg flex items-center justify-between">
          <span className="text-xs text-red-400">消息发送失败</span>
          <button onClick={onRetry} className="text-xs text-red-400 hover:text-red-300 underline">
            重试
          </button>
        </div>
      )}

      <div className="px-4 py-3 border-t border-zinc-800">
        <div className="flex gap-2">
          <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg focus-within:border-blue-500 transition-colors">
            <EditorContent editor={editor} />
          </div>
          {streaming ? (
            <button
              onClick={onStop}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm self-end flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="8" height="8" rx="1" />
              </svg>
              停止
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isEmpty}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm self-end"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default ChatPanel;
