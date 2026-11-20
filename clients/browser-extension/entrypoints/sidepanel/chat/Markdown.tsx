import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// GFM gives tables and task lists. Single-dollar math is off so prices like "$204" stay text; use $$...$$ for math.
const REMARK_PLUGINS: any[] = [remarkGfm, [remarkMath, { singleDollarTextMath: false }]];
const REHYPE_PLUGINS: any[] = [rehypeKatex];

const components = {
	h1: ({ children }: any) => <h1 className="md-h1">{children}</h1>,
	h2: ({ children }: any) => <h2 className="md-h2">{children}</h2>,
	h3: ({ children }: any) => <h3 className="md-h3">{children}</h3>,
	code({ className, children, ...props }: any) {
		const match = /language-(\w+)/.exec(className || "");
		return match ? (
			<pre className="md-pre">
				<span className="md-pre__lang">{match[1]}</span>
				<code className={className} {...props}>
					{children}
				</code>
			</pre>
		) : (
			<code className="md-code" {...props}>
				{children}
			</code>
		);
	},
	p: ({ children }: any) => <p className="md-p">{children}</p>,
	ul: ({ children }: any) => <ul className="md-ul">{children}</ul>,
	ol: ({ children }: any) => <ol className="md-ol">{children}</ol>,
	li: ({ children }: any) => <li className="md-li">{children}</li>,
	a: ({ href, children }: any) => (
		<a href={href} target="_blank" rel="noopener noreferrer" className="md-a">
			{children}
		</a>
	),
};

/** Agent reply renderer: GFM tables, $$ math, external links in new tabs. */
export function Markdown({ children }: { children: string }) {
	return (
		<div className="md">
			<ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={components}>
				{children}
			</ReactMarkdown>
		</div>
	);
}
