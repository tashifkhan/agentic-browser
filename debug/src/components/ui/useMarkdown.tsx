import React, { useMemo, useEffect } from "react";
import MarkdownIt from "markdown-it";
// @ts-expect-error missing types
import taskLists from "markdown-it-task-lists";
import parse, { Element } from "html-react-parser";
import mermaid from "mermaid";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy, Terminal } from "lucide-react";

// ============================================
// COMPONENT: CodeBlock
// ============================================
const CodeBlock = ({ language, code }: { language: string; code: string }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-6 overflow-hidden rounded-xl border border-gray-700/50 bg-[#1e1e1e] shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2 bg-[#282c34] border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            {language || "text"}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <SyntaxHighlighter
        language={language.toLowerCase()}
        style={oneDark}
        customStyle={{ margin: 0, padding: "1.5rem", background: "transparent", fontSize: "0.9rem", lineHeight: "1.6" }}
        showLineNumbers={true}
        lineNumberStyle={{ minWidth: "2.5em", paddingRight: "1em", color: "#4b5563", borderRight: "1px solid #374151", marginRight: "1em" }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

// ============================================
// COMPONENT: MermaidBlock
// ============================================
const MermaidBlock = ({ code }: { code: string }) => {
  const id = useMemo(() => `mermaid-${Math.random().toString(36).substring(2, 9)}`, []);

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: "dark" });
    setTimeout(() => {
      mermaid.contentLoaded();
      mermaid.init(undefined, `#${id}`);
    }, 0);
  }, [code, id]);

  return (
    <div className="flex justify-center my-6 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] p-6 shadow-sm">
      <div id={id} className="mermaid">
        {code}
      </div>
    </div>
  );
};

// ============================================
// HOOK IMPLEMENTATION
// ============================================
export function useMarkdown(content: string) {
  const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

  const md = useMemo(() => {
    const instance = new MarkdownIt({ html: true, linkify: true, typographer: true })
      .use(taskLists, { label: true });

    // 1. INTERCEPT CODE BLOCKS FOR REACT INJECTION
    instance.renderer.rules.fence = (tokens, idx) => {
      const lang = tokens[idx].info.trim();
      const code = instance.utils.escapeHtml(tokens[idx].content);
      
      if (lang === "mermaid") return `<div data-mermaid-block="true">${code}</div>`;
      return `<div data-code-block="true" data-language="${lang}">${code}</div>`;
    };

    // 2. GFM CALLOUTS PARSER (> [!NOTE])
    instance.core.ruler.after('block', 'gfm_alerts', (state) => {
      const tokens = state.tokens;
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === 'blockquote_open') {
          const pOpen = tokens[i + 1];
          const inline = tokens[i + 2];

          if (pOpen?.type === 'paragraph_open' && inline?.type === 'inline') {
            const match = inline.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER)\]/i);
            if (match) {
              const type = match[1].toLowerCase();
              tokens[i].attrJoin('class', `gfm-alert gfm-alert-${type}`);
              
              // Remove the indicator text
              inline.content = inline.content.replace(/^\[!.*?\]\s*/, '');
              if (inline.children?.[0]) {
                inline.children[0].content = inline.children[0].content.replace(/^\[!.*?\]\s*/, '');
              }

              // Alert Title & Icon mapping
              const titleHtml = new state.Token('html_inline', '', 0);
              const icons: Record<string, string> = {
                note: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
                tip: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>',
                warning: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>',
                danger: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
                caution: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
                important: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>',
              };
              
              const title = type === 'note' ? 'Note' : type === 'tip' ? 'Tip' : type === 'warning' ? 'Warning' : type === 'important' ? 'Important' : 'Danger';
              
              titleHtml.content = `<div class="flex items-center gap-2 font-bold mb-2 uppercase tracking-wide text-sm alert-title">${icons[type] || icons.note} ${title}</div>`;
              inline.children?.unshift(titleHtml);
            }
          }
        }
      }
    });

    // 3. OTHER STANDARD RENDERERS (Headings, Paragraphs, etc.)
    instance.renderer.rules.heading_open = (tokens, idx) => {
      const tag = tokens[idx].tag;
      const title = tokens[idx + 1].content;
      const id = slugify(title);
      return `<${tag} id="${id}" class="md-heading md-${tag}">`;
    };

    instance.renderer.rules.heading_close = (tokens, idx) => {
      const tag = tokens[idx].tag;
      const id = slugify(tokens[idx - 1].content);
      const link = `<a href="#${id}" class="md-heading-link">#</a>`;
      return `${link}</${tag}>`;
    };

    instance.renderer.rules.paragraph_open = () => `<p class="md-p">`;
    instance.renderer.rules.code_inline = (tokens, idx) => `<code class="md-code-inline">${instance.utils.escapeHtml(tokens[idx].content)}</code>`;
    
    // Standard Blockquote (if not a Callout)
    instance.renderer.rules.blockquote_open = (tokens, idx, options, _env, self) => {
      if (tokens[idx].attrGet('class')?.includes('gfm-alert')) {
        return self.renderToken(tokens, idx, options);
      }
      return `<blockquote class="relative my-8 pl-8 pr-4 py-4 border-l-4 border-primary/40 bg-gray-50/50 dark:bg-gray-800/30 rounded-r-xl italic text-gray-700 dark:text-gray-300 shadow-sm ring-1 ring-inset ring-gray-200 dark:ring-gray-800"><svg class="absolute top-4 left-2 w-4 h-4 text-primary/40 transform -scale-x-100" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21L14.017 18C14.017 16.8954 13.1216 16 12.017 16H9C8.44772 16 8 15.5523 8 15V9C8 8.44772 8.44772 8 9 8H15C15.5523 8 16 8.44772 16 9V11C16 11.5523 16.4477 12 17 12H20C20.5523 12 21 11.5523 21 11V7C21 4.79086 19.2091 3 17 3H7C4.79086 3 3 4.79086 3 7V15C3 17.2091 4.79086 19 7 19H14.017ZM21.983 21H16.983C16.4307 21 15.983 20.5523 15.983 20V16.983C15.983 16.4307 16.4307 15.983 16.983 15.983H19.983V14.983H18.983C18.4307 14.983 17.983 14.5353 17.983 13.983V10.983C17.983 10.4307 18.4307 9.983 18.983 9.983H21.983C22.5353 9.983 22.983 10.4307 22.983 10.983V13.983C22.983 14.5353 22.5353 14.983 21.983 14.983H20.983V20C20.983 20.5523 20.5353 21 21.983 21Z" /></svg>`;
    };

    instance.renderer.rules.table_open = () => `<div class="md-table-wrapper"><table class="md-table">`;
    instance.renderer.rules.table_close = () => `</table></div>`;
    instance.renderer.rules.th_open = () => `<th class="md-th">`;
    instance.renderer.rules.td_open = () => `<td class="md-td">`;
    instance.renderer.rules.bullet_list_open = () => `<ul class="md-ul">`;
    instance.renderer.rules.ordered_list_open = () => `<ol class="md-ol">`;

    return instance;
  }, []);

  const renderedParts = useMemo(() => {
    // Convert Markdown to a full HTML string
    const htmlString = md.render(content);

    // Map HTML nodes cleanly to React Components
    return parse(htmlString, {
      replace: (domNode) => {
        if (domNode instanceof Element && domNode.attribs) {
          
          // Swap Code Blocks
          if (domNode.attribs["data-code-block"]) {
            // Because domNode.children[0] comes from html-react-parser, it's already safely unescaped!
            const rawCode = (domNode.children[0] as any)?.data || "";
            return <CodeBlock language={domNode.attribs["data-language"]} code={rawCode} />;
          }

          // Swap Mermaid Blocks
          if (domNode.attribs["data-mermaid-block"]) {
            const rawCode = (domNode.children[0] as any)?.data || "";
            return <MermaidBlock code={rawCode} />;
          }
        }
      },
    });
  }, [content, md]);

  return { renderedParts };
}
