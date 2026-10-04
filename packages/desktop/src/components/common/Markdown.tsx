import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders model output as Markdown (GitHub flavour: tables, task lists,
 * strikethrough, autolinks).
 *
 * Agent replies used to be split on blank lines and printed as plain
 * paragraphs, so every table the research loop appends -- the plan
 * checklist and the evidence traceability index -- showed up as raw "| --- |"
 * text, and **bold**, lists and code did the same. react-markdown builds
 * React elements and never injects raw HTML, so untrusted model output
 * cannot smuggle markup into the page.
 */
const components: Components = {
  h1: ({ children }) => <h3 className="text-[17px] font-bold text-text-primary pt-1">{children}</h3>,
  h2: ({ children }) => <h3 className="text-[16px] font-bold text-text-primary pt-1">{children}</h3>,
  h3: ({ children }) => <h3 className="text-[15px] font-bold text-text-primary pt-1">{children}</h3>,
  h4: ({ children }) => <h4 className="text-[14px] font-semibold text-text-primary">{children}</h4>,
  p: ({ children }) => <p className="text-text-secondary">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 text-text-secondary">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 text-text-secondary">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="pl-3 border-l-2 border-accent/40 text-text-secondary">{children}</blockquote>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className={`${className} block`}>{children}</code>
    ) : (
      <code className="px-1 py-0.5 rounded bg-bg-elevated border border-border-subtle font-mono text-[12.5px]">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="p-3 rounded-lg bg-bg-elevated border border-border-subtle font-mono text-[12.5px] overflow-x-auto">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-[12.5px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-bg-elevated">{children}</thead>,
  th: ({ children, style }) => (
    <th style={style} className="px-3 py-2 text-left font-semibold text-text-primary border-b border-border whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="px-3 py-2 align-top text-text-secondary border-b border-border-subtle min-w-[5em] first:whitespace-nowrap">
      {children}
    </td>
  ),
  hr: () => <hr className="border-border" />,
};

export const Markdown: React.FC<{ children: string; className?: string }> = ({ children, className }) => (
  <div className={className ?? 'space-y-3'}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  </div>
);
