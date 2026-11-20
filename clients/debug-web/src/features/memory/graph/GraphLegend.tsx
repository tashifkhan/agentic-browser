import { Dot } from "../Dot";
import { segmentColor, segmentLabel } from "../constants";

/** Segment chips; click one to show only that segment. */
export function GraphLegend({ segments, only, onPick }: { segments: string[]; only: string | null; onPick: (s: string | null) => void }) {
  return (
    <div className="graph-legend">
      {segments.map((s) => (
        <button key={s} type="button" className={`graph-legend__item${only && only !== s ? " is-dim" : ""}`} onClick={() => onPick(only === s ? null : s)} aria-pressed={only === s}>
          <Dot color={segmentColor(s)} /> {segmentLabel(s)}
        </button>
      ))}
    </div>
  );
}
