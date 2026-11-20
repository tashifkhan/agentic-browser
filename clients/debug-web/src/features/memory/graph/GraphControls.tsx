import { Plus, RefreshCw } from "@agentic-browser/shared/icons";
import { IconButton, Kbd } from "@agentic-browser/shared/ui";

/** History toggle and keyboard hints top-right, zoom buttons bottom-right. */
export function GraphControls({
  history, historyCount, onHistory, onZoom, onFit,
}: {
  history: boolean;
  historyCount: number;
  onHistory: (v: boolean) => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
}) {
  return (
    <>
      <div className="graph-search">
        <label className="graph-toggle">
          <input type="checkbox" checked={history} onChange={(e) => onHistory(e.target.checked)} />
          <span>Show replaced memories{historyCount ? ` (${historyCount})` : ""}</span>
        </label>
        <span className="graph-hint">
          <Kbd>f</Kbd> fit <Kbd>esc</Kbd> reset
        </span>
      </div>
      <div className="graph-zoom">
        <IconButton label="Zoom in" variant="default" size="sm" onClick={() => onZoom(1.5)}>
          <Plus size={14} />
        </IconButton>
        <IconButton label="Zoom out" variant="default" size="sm" onClick={() => onZoom(0.67)}>
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>−</span>
        </IconButton>
        <IconButton label="Fit to screen" variant="default" size="sm" onClick={onFit}>
          <RefreshCw size={13} />
        </IconButton>
      </div>
    </>
  );
}
