import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkSourceLine from '../utils/remarkSourceLine';
import { Prism } from 'react-syntax-highlighter';
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';
import type { Components } from 'react-markdown';

const components: Components = {
  code({ className, children, ...rest }) {
    const match = /language-(\w+)/.exec(className || '');
    const text = String(children).replace(/\n$/, '');

    if (!match) {
      return (
        <code className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded text-sm font-mono" {...rest}>
          {children}
        </code>
      );
    }

    return (
      <Prism style={oneDark} language={match[1]} customStyle={{ borderRadius: '0.375rem', padding: '1rem', margin: 0 }}>
        {text}
      </Prism>
    );
  },
};

export default function MarkdownRenderer({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkSourceLine]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
