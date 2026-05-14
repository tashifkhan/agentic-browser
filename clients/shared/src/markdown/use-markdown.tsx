import React, { useEffect, useMemo } from "react";
import MarkdownIt from "markdown-it";
// @ts-expect-error missing types
import taskLists from "markdown-it-task-lists";
import parse, { Element } from "html-react-parser";
import mermaid from "mermaid";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import vscDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus";
import { Check, Copy } from "lucide-react";

const LANG_COLORS: Record<string, string> = {
  bash: "#4ade80", sh: "#4ade80", shell: "#4ade80", zsh: "#4ade80",
  javascript: "#f7df1e", js: "#f7df1e",
  typescript: "#60a5fa", ts: "#60a5fa", tsx: "#60a5fa", jsx: "#60a5fa",
  python: "#facc15", py: "#facc15",
  rust: "#fb923c",
  go: "#22d3ee",
  json: "#a78bfa",
  yaml: "#f472b6", yml: "#f472b6",
  css: "#38bdf8", scss: "#f472b6",
  html: "#fb923c", xml: "#fb923c",
  sql: "#facc15",
  markdown: "#94a3b8", md: "#94a3b8",
  ruby: "#f87171", rb: "#f87171",
  java: "#fb923c",
  c: "#94a3b8", cpp: "#94a3b8",
  dockerfile: "#38bdf8",
  toml: "#a78bfa", ini: "#a78bfa",
};

const CodeBlock = ({ language, code }: { language: string; code: string }) => {
  const [copied, setCopied] = React.useState(false);
  const lang = language?.toLowerCase() || "text";
  const accentColor = LANG_COLORS[lang] || "#94a3b8";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      position: "relative",
      margin: "1.25rem 0",
      borderRadius: "8px",
      border: "1px solid rgba(240, 246, 252, 0.1)",
      background: "#0d1117",
      boxShadow: "0 4px 24px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "9px 14px",
        background: "linear-gradient(180deg, #1c2128 0%, #161b22 100%)",
        borderBottom: "1px solid rgba(240, 246, 252, 0.08)",
        userSelect: "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* macOS traffic lights */}
          <div style={{ display: "flex", gap: "5px", marginRight: "2px" }}>
            <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f57", boxShadow: "0 0 0 0.5px rgba(0,0,0,0.3)" }} />
            <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#febc2e", boxShadow: "0 0 0 0.5px rgba(0,0,0,0.3)" }} />
            <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#28c840", boxShadow: "0 0 0 0.5px rgba(0,0,0,0.3)" }} />
          </div>
          {/* Language badge */}
          <span style={{
            fontSize: "0.68rem",
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: accentColor,
            background: `${accentColor}18`,
            border: `1px solid ${accentColor}28`,
            padding: "1px 7px",
            borderRadius: "4px",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          }}>
            {lang}
          </span>
        </div>
        {/* Copy button */}
        <button
          onClick={handleCopy}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "3px 9px",
            borderRadius: "5px",
            border: `1px solid ${copied ? "rgba(74, 222, 128, 0.25)" : "rgba(240, 246, 252, 0.08)"}`,
            background: copied ? "rgba(34, 197, 94, 0.08)" : "rgba(240, 246, 252, 0.03)",
            color: copied ? "#4ade80" : "#6e7681",
            fontSize: "0.68rem",
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.15s ease",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            letterSpacing: "0.03em",
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {/* Code body */}
      <div style={{ overflowX: "auto" }}>
        <SyntaxHighlighter
          language={lang}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: "1.1rem 0",
            background: "transparent",
            fontSize: "0.825rem",
            lineHeight: "1.75",
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
          }}
          showLineNumbers
          lineNumberStyle={{
            minWidth: "3.2em",
            paddingRight: "1.2em",
            paddingLeft: "0.8em",
            color: "#30363d",
            borderRight: "1px solid rgba(240, 246, 252, 0.06)",
            marginRight: "1em",
            userSelect: "none",
            fontSize: "0.78rem",
          }}
          wrapLines
          lineProps={{ style: { paddingRight: "1.5rem" } }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

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
    <div className="my-6 flex justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-6 shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
      <div id={id} className="mermaid">
        {code}
      </div>
    </div>
  );
};

export function useMarkdown(content: string) {
  const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

  const md = useMemo(() => {
    const instance = new MarkdownIt({ html: true, linkify: true, typographer: true }).use(taskLists, { label: true });

    instance.renderer.rules.fence = (tokens, idx) => {
      const lang = tokens[idx].info.trim();
      const code = instance.utils.escapeHtml(tokens[idx].content);

      if (lang === "mermaid") return `<div data-mermaid-block="true">${code}</div>`;
      return `<div data-code-block="true" data-language="${lang}">${code}</div>`;
    };

    instance.core.ruler.after("block", "gfm_alerts", (state) => {
      const tokens = state.tokens;
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== "blockquote_open") continue;
        const pOpen = tokens[i + 1];
        const inline = tokens[i + 2];
        if (pOpen?.type !== "paragraph_open" || inline?.type !== "inline") continue;
        const match = inline.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER)\]/i);
        if (!match) continue;

        const type = match[1].toLowerCase();
        tokens[i].attrJoin("class", `gfm-alert gfm-alert-${type}`);
        inline.content = inline.content.replace(/^\[!.*?\]\s*/, "");
        if (inline.children?.[0]) {
          inline.children[0].content = inline.children[0].content.replace(/^\[!.*?\]\s*/, "");
        }

        const titleHtml = new state.Token("html_inline", "", 0);
        const icons: Record<string, string> = {
          note: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
          tip: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>',
          warning: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>',
          danger: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
          caution: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
          important: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>',
        };

        const title = type === "note" ? "Note" : type === "tip" ? "Tip" : type === "warning" ? "Warning" : type === "important" ? "Important" : "Danger";
        titleHtml.content = `<div class="alert-title mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide">${icons[type] || icons.note} ${title}</div>`;
        inline.children?.unshift(titleHtml);
      }
    });

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
    instance.renderer.rules.blockquote_open = (tokens, idx, options, _env, self) => {
      if (tokens[idx].attrGet("class")?.includes("gfm-alert")) {
        return self.renderToken(tokens, idx, options);
      }
      return '<blockquote class="relative my-8 rounded-r-xl border-l-4 border-primary/40 bg-gray-50/50 py-4 pr-4 pl-8 italic text-gray-700 shadow-sm ring-1 ring-gray-200 ring-inset dark:bg-gray-800/30 dark:text-gray-300 dark:ring-gray-800"><svg class="absolute top-4 left-2 h-4 w-4 -scale-x-100 text-primary/40" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21L14.017 18C14.017 16.8954 13.1216 16 12.017 16H9C8.44772 16 8 15.5523 8 15V9C8 8.44772 8.44772 8 9 8H15C15.5523 8 16 8.44772 16 9V11C16 11.5523 16.4477 12 17 12H20C20.5523 12 21 11.5523 21 11V7C21 4.79086 19.2091 3 17 3H7C4.79086 3 3 4.79086 3 7V15C3 17.2091 4.79086 19 7 19H14.017ZM21.983 21H16.983C16.4307 21 15.983 20.5523 15.983 20V16.983C15.983 16.4307 16.4307 15.983 16.983 15.983H19.983V14.983H18.983C18.4307 14.983 17.983 14.5353 17.983 13.983V10.983C17.983 10.4307 18.4307 9.983 18.983 9.983H21.983C22.5353 9.983 22.983 10.4307 22.983 10.983V13.983C22.983 14.5353 22.5353 14.983 21.983 14.983H20.983V20C20.983 20.5523 20.5353 21 21.983 21Z" /></svg>';
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
    const htmlString = md.render(content);
    return parse(htmlString, {
      replace: (domNode) => {
        if (!(domNode instanceof Element) || !domNode.attribs) return;
        if (domNode.attribs["data-code-block"]) {
          const rawCode = (domNode.children[0] as { data?: string } | undefined)?.data || "";
          return <CodeBlock language={domNode.attribs["data-language"]} code={rawCode} />;
        }
        if (domNode.attribs["data-mermaid-block"]) {
          const rawCode = (domNode.children[0] as { data?: string } | undefined)?.data || "";
          return <MermaidBlock code={rawCode} />;
        }
      },
    });
  }, [content, md]);

  return { renderedParts };
}
