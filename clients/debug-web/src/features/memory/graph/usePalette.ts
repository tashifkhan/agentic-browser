import { useEffect, useState } from "react";
import { SEGMENTS, resolveColor } from "../constants";

export type Palette = { bg: string; surface: string; text: string; muted: string; line: string; segment: (s: string) => string };

function read(): Palette {
  const seg = Object.fromEntries(Object.entries(SEGMENTS).map(([k, v]) => [k, resolveColor(v.color)]));
  return {
    bg: resolveColor("var(--surface)"),
    surface: resolveColor("var(--raised)"),
    text: resolveColor("var(--text)"),
    muted: resolveColor("var(--text-3)"),
    line: resolveColor("var(--line-strong)"),
    segment: (s) => seg[s] ?? resolveColor("var(--text-3)"),
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
