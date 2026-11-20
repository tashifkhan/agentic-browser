import { useMarkdown } from "@agentic-browser/shared/markdown";

/** Some stored replies are JSON content blocks; show their text parts. */
function extractText(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed.filter((b) => b?.type === "text").map((b) => b.text).join("\n\n");
  } catch {
    /* plain text */
  }
  return content;
}

export function Markdown({ text }: { text: string }) {
  const { renderedParts } = useMarkdown(extractText(text || ""));
  return <>{renderedParts}</>;
}
