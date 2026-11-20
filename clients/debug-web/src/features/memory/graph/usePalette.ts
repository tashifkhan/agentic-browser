import { useEffect, useState } from "react";
import { SEGMENTS, resolveColor } from "../constants";

export type Palette = {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  warn: string;
  err: string;
  segment: (s: string) => string;
  entity: (type: string) => string;
};

// Entity types share a few hues so people, places and things are easy to tell apart.
const ENTITY_COLOR: Record<string, string> = {
  person: "var(--accent)",
  organization: "var(--info)",
  project: "var(--warn)",
  location: "var(--teal)",
  skill: "var(--ok)",
  topic: "var(--violet)",
  preference: "var(--teal)",
};

function read(): Palette {
  const seg = Object.fromEntries(Object.entries(SEGMENTS).map(([k, v]) => [k, resolveColor(v.color)]));
  const ent = Object.fromEntries(Object.entries(ENTITY_COLOR).map(([k, v]) => [k, resolveColor(v)]));
  const muted = resolveColor("var(--text-3)");
  return {
    bg: resolveColor("var(--surface)"),
    surface: resolveColor("var(--raised)"),
    text: resolveColor("var(--text)"),
    muted,
    line: resolveColor("var(--line-strong)"),
    warn: resolveColor("var(--warn)"),
    err: resolveColor("var(--err)"),
    segment: (s) => seg[s] ?? muted,
    entity: (t) => ent[t] ?? resolveColor("var(--text-2)"),
  };
}

/** Theme colours resolved for canvas drawing, refreshed when the theme flips. */
export function usePalette(): Palette {
  const [p, setP] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setP(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return p;
}
