import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { FileRef, ToolEvent } from '../api/client';
import type { TextSelection } from '../hooks/useTextSelection';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  references?: FileRef[];
  toolEvents?: ToolEvent[];
}

interface Props {
  messages: Message[];
  streaming: boolean;
  streamingText: string;
  streamingToolEvents: ToolEvent[];
  selection: TextSelection | null;
  pendingAsk?: string | null;
  onClearPendingAsk?: () => void;
  onSend: (message: string, references: FileRef[]) => void;
  onClearSelection: () => void;
  getReference: () => string;
  onReferenceClick?: (file: string, startLine?: number, endLine?: number) => void;
}

const REF_REGEX = /\[([^\[\]:]+\.md)(?::(\d+):(\d+))?\]/g;

function MessageContent({ content, onRefClick }: { content: string; onRefClick?: Props['onReferenceClick'] }) {
  const parts: (string | { file: string; start?: number; end?: number; raw: string })[] = [];
  let last = 0;
  const regex = new RegExp(REF_REGEX.source, 'g');
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
    return <ReactMarkdown>{content}</ReactMarkdown>;
  }

  return (
    <div>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <ReactMarkdown key={i}>{part}</ReactMarkdown>
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

function toolLabel(event: ToolEvent): string {
  const path = (event.args as Record<string, unknown>)?.path as string | undefined;
  if (event.type === 'tool-call') {
    if (event.toolName === 'read_file') return `Reading ${path ?? 'file'}`;
    if (event.toolName === 'write_file') return `Writing ${path ?? 'file'}`;
    return event.toolName;
  }
  if (event.toolName === 'read_file') return `Read ${path ?? 'file'}`;
  if (event.toolName === 'write_file') return `Wrote ${path ?? 'file'}`;
  return `${event.toolName} done`;
}

function ToolEventCard({ event }: { event: ToolEvent }) {
  const [expanded, setExpanded] = useState(false);
  const isCall = event.type === 'tool-call';
  const icon = isCall
    ? event.toolName === 'read_file' ? '\u{1F4D6}' : '\u{270F}\u{FE0F}'
    : '\u2713';

  return (
    <div className="my-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2 py-1 bg-zinc-700/50 border border-zinc-600/50 rounded text-xs text-zinc-400 hover:bg-zinc-700 w-full text-left"
      >
        <span>{icon}</span>
        <span className="flex-1 truncate">{toolLabel(event)}</span>
        <span className="text-zinc-500 text-[10px]">{expanded ? '\u25BE' : '\u25B8'}</span>
      </button>
      {expanded && (
        <pre className="mt-0.5 px-2 py-1 bg-zinc-800 rounded text-[10px] text-zinc-500 font-mono overflow-x-auto max-h-24 overflow-y-auto">
          {JSON.stringify(isCall ? event.args : event.result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ReferenceBadge({ fileRef, onClick }: { fileRef: FileRef; onClick?: Props['onReferenceClick'] }) {
  const label = fileRef.startLine
    ? `${fileRef.file}:${fileRef.startLine}:${fileRef.endLine}`
    : fileRef.file;
  return (
    <button
      onClick={() => onClick?.(fileRef.file, fileRef.startLine, fileRef.endLine)}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-900/40 border border-blue-700/50 rounded text-blue-400 text-xs hover:bg-blue-800/40"
    >
      [{label}]
    </button>
  );
}

function ToolEventsList({ events }: { events: ToolEvent[] }) {
  // Pair tool-call and tool-result by toolName sequence: show only the call card
  // but mark it as completed if a matching result follows
  return (
    <div className="mb-2 space-y-0.5">
      {events.map((evt, i) => (
        <ToolEventCard key={i} event={evt} />
      ))}
    </div>
  );
}

export default function ChatPanel({
  messages,
  streaming,
  streamingText,
  streamingToolEvents,
  selection,
  pendingAsk,
  onClearPendingAsk,
  onSend,
  onClearSelection,
  getReference,
  onReferenceClick,
}: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, streamingToolEvents]);

  useEffect(() => {
    if (pendingAsk) {
      inputRef.current?.focus();
    }
  }, [pendingAsk]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || streaming) return;
    const refs: FileRef[] = [];
    if (selection) {
      refs.push({ file: selection.fileName, startLine: selection.startLine, endLine: selection.endLine });
    }
    const msg = selection ? `${getReference()} ${text}` : text;
    onSend(msg, refs);
    setInput('');
    onClearSelection();
    onClearPendingAsk?.();
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <div className="px-4 py-2 border-b border-zinc-800">
        <span className="text-sm font-semibold text-zinc-400">Teacher</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-200'
              }`}
            >
              {/* User reference badges */}
              {msg.role === 'user' && msg.references && msg.references.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {msg.references.map((r, i) => (
                    <ReferenceBadge key={i} fileRef={r} onClick={onReferenceClick} />
                  ))}
                </div>
              )}

              {/* Tool events for assistant messages */}
              {msg.role === 'assistant' && msg.toolEvents && msg.toolEvents.length > 0 && (
                <ToolEventsList events={msg.toolEvents} />
              )}

              {/* Message content */}
              {msg.content && (
                <div className="prose prose-invert prose-sm max-w-none">
                  <MessageContent content={msg.content} onRefClick={onReferenceClick} />
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming assistant message */}
        {streaming && (streamingText || streamingToolEvents.length > 0) && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-3 py-2 rounded-lg text-sm bg-zinc-800 text-zinc-200">
              {streamingToolEvents.length > 0 && (
                <ToolEventsList events={streamingToolEvents} />
              )}
              {streamingText && (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{streamingText}</ReactMarkdown>
                </div>
              )}
              {!streamingText && (
                <span className="text-zinc-400 animate-pulse">...</span>
              )}
            </div>
          </div>
        )}
        {streaming && !streamingText && streamingToolEvents.length === 0 && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-lg text-sm bg-zinc-800 text-zinc-400">
              <span className="animate-pulse">思考中...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Selection / pending ask badge */}
      {(selection || pendingAsk) && (
        <div className="px-4 py-1.5 border-t border-zinc-800 flex items-center gap-2 bg-zinc-900">
          {selection && (
            <span className="text-xs text-blue-400 bg-blue-900/30 border border-blue-700/50 px-2 py-0.5 rounded">
              {getReference()}
            </span>
          )}
          <span className="text-xs text-zinc-500 truncate flex-1">
            "{(selection?.text ?? pendingAsk ?? '').slice(0, 80)}{(selection?.text ?? pendingAsk ?? '').length > 80 ? '...' : ''}"
          </span>
          <button onClick={() => { onClearSelection(); onClearPendingAsk?.(); }} className="text-zinc-500 hover:text-zinc-300 text-xs">&times;</button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={selection ? '针对选中内容提问...' : '输入消息...'}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 resize-none outline-none focus:border-blue-500 placeholder-zinc-500"
          />
          <button
            onClick={handleSubmit}
            disabled={streaming || !input.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm self-end"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
