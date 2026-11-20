import type { Run, RunEvent } from "@agentic-browser/shared/api";

/**
 * Tool and model results arrive as JSON, Python reprs of content blocks, or
 * plain text. Pull out the readable text whichever form it takes.
 */
export function parseResultText(raw: string | undefined | null): string {
  if (!raw) return "";
  const s = raw.trim();

  // Helper to recursively extract text blocks from parsed objects
  const extractText = (obj: any): string[] => {
    if (Array.isArray(obj)) return obj.flatMap(extractText);
    if (obj && typeof obj === "object") {
      if (obj.type === "text" && typeof obj.text === "string") return [obj.text];
      // Also handle {text: "..."} without type field
      if (typeof obj.text === "string" && Object.keys(obj).length <= 2) return [obj.text];
    }
    if (typeof obj === "string") return [obj];
    return [];
  };

  // Strategy 1: Direct JSON.parse
  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === "object" && parsed !== null) {
      const texts = extractText(parsed);
      if (texts.length > 0) return texts.join("\n\n");
    }
    if (typeof parsed === "string") return parsed;
  } catch (_) { /* continue */ }

  // Strategy 2: Python repr — single quotes like [{'type': 'text', 'text': '...'}]
  // Convert Python-style single-quoted dicts to JSON
  if (s.startsWith("[{") || s.startsWith("{'")) {
    try {
      // Replace Python single quotes with double quotes (careful with apostrophes)
      const jsonified = s
        .replace(/'/g, '"')
        .replace(/"s\b/g, "'s") // restore common apostrophes
        .replace(/\\n/g, "\n");
      const parsed = JSON.parse(jsonified);
      const texts = extractText(parsed);
      if (texts.length > 0) return texts.join("\n\n");
    } catch (_) { /* continue */ }
  }

  // Strategy 3: Regex extraction — grab text from "text": "..." or 'text': '...' patterns
  // This handles truncated/broken JSON gracefully
  const textBlockPattern = /["']text["']\s*:\s*["']((?:[^"'\\]|\\.)*)["']/g;
  const matches: string[] = [];
  let m;
  while ((m = textBlockPattern.exec(s)) !== null) {
    const decoded = m[1]
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\");
    if (decoded.length > 10) matches.push(decoded);
  }
  if (matches.length > 0) return matches.join("\n\n");

  // Strategy 4: Strip leading [{"type": "text", "text": " wrapper if present
  const wrapperMatch = s.match(/^\[?\{?["']?type["']?\s*:\s*["']text["']\s*,\s*["']text["']\s*:\s*["']([\s\S]+)$/);
  if (wrapperMatch) {
    let text = wrapperMatch[1];
    // Remove trailing "}] or similar
    text = text.replace(/["']\s*\}?\]?\s*$/, "");
    text = text.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"');
    if (text.length > 10) return text;
  }

  return raw;
}

/** Markdown to a single readable line: no emphasis marks, bullets or table pipes. */
export function plainText(md: string): string {
  return md
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, "") // table divider rows
    .replace(/\s*\|\s*/g, " · ") // table cells
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "") // list markers
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__|\*|_|`)(.+?)\1/g, "$2")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/(?:\s*·\s*){2,}/g, " · ")
    .replace(/(?:^\s*·\s*)|(?:\s*·\s*$)/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** One-line summary of a run for list rows. */
export function runSummary(run: Pick<Run, "error" | "final_answer">): string {
  const raw = run.error ?? run.final_answer ?? "";
  return raw ? plainText(parseResultText(raw)).slice(0, 220) : "";
}

export function shortId(id: string) {
  return id.replace(/^run_/, "").slice(0, 12);
}

/** The most telling string in an event payload, for the trace label. */
export function eventSummary(ev: RunEvent): string {
  const p = ev.payload ?? {};
  const pick = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const action = p.args && typeof p.args === "object" ? (p.args as Record<string, unknown>).action : undefined;
  const act = action && typeof action === "object" ? Object.values(action as Record<string, unknown>).join(" ") : "";
  const tool = pick("tool");
  const result = p.result;
  const resultText =
    typeof result === "string"
      ? plainText(result)
      : result && typeof result === "object" && "success" in result
        ? ((result as { success?: boolean }).success ? "succeeded" : "failed")
        : "";
  return (
    (tool && act ? `${tool}: ${act}` : "") ||
    (tool && resultText ? `${tool}: ${resultText}` : "") ||
    tool ||
    pick("task") ||
    pick("answer") ||
    pick("message") ||
    pick("error") ||
    pick("goal") ||
    pick("reason") ||
    pick("subagent") ||
    ev.event_type.replace(/_/g, " ")
  ).replace(/\s+/g, " ");
}
