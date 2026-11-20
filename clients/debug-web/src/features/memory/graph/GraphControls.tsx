import { Plus, RefreshCw } from "@agentic-browser/shared/icons";
import { IconButton, Kbd, SearchField } from "@agentic-browser/shared/ui";

/** Search plus zoom buttons, laid over the top-right of the graph. */
export function GraphControls({ search, onSearch, onZoom, onFit }: { search: string; onSearch: (s: string) => void; onZoom: (factor: number) => void; onFit: () => void }) {
  return (
    <>
      <div className="graph-search">
        <SearchField value={search} onChange={onSearch} placeholder="Find a memory" width={220} />
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
