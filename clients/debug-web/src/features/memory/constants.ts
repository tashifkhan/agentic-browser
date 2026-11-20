// Labels and colours for memory tiers and segments. Values match the
// backend enums in models/memory.py.

export const TIERS = [
  { id: "working", label: "Working", color: "var(--accent)" },
  { id: "short_term", label: "Short-term", color: "var(--info)" },
  { id: "long_term", label: "Long-term", color: "var(--violet)" },
  { id: "permanent", label: "Permanent", color: "var(--warn)" },
] as const;

export const SEGMENTS: Record<string, { label: string; color: string }> = {
  core_identity: { label: "Identity", color: "var(--accent)" },
  preferences_and_corrections: { label: "Preferences", color: "var(--teal)" },
  projects_and_goals: { label: "Projects", color: "var(--warn)" },
  people_and_relationships: { label: "People", color: "var(--violet)" },
  skills_and_background: { label: "Skills", color: "var(--ok)" },
  communications_and_commitments: { label: "Commitments", color: "var(--info)" },
  contextual_incidents: { label: "Events", color: "var(--text-3)" },
  reflections_and_summaries: { label: "Reflections", color: "var(--err)" },
};

const humanize = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export const tierLabel = (id: string) => TIERS.find((t) => t.id === id)?.label ?? humanize(id);
export const tierColor = (id: string) => TIERS.find((t) => t.id === id)?.color ?? "var(--text-3)";
export const segmentLabel = (id: string) => SEGMENTS[id]?.label ?? humanize(id || "other");
export const segmentColor = (id: string) => SEGMENTS[id]?.color ?? "var(--text-3)";

/** Canvas can't read CSS variables, so resolve one to a concrete colour. */
export function resolveColor(cssValue: string): string {
  const m = cssValue.match(/^var\((--[\w-]+)\)$/);
  if (!m) return cssValue;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || "#888";
}
