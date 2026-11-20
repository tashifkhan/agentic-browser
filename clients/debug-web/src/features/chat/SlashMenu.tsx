import type { SlashCommand } from "./commands";

/** Command suggestions above the composer. Keyboard handling lives in Composer. */
export function SlashMenu({ items, active, onHover, onPick }: { items: SlashCommand[]; active: number; onHover: (i: number) => void; onPick: (c: SlashCommand) => void }) {
  return (
    <div className="slash ab-pop" role="listbox" aria-label="Commands">
      <div className="slash__head">
        <span>Commands</span>
        <span>↑↓ move, tab picks, esc closes</span>
      </div>
      {items.map((c, i) => (
        <button
          key={c.cmd}
          type="button"
          role="option"
          aria-selected={i === active}
          className={`slash__item${i === active ? " is-on" : ""}`}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(c);
          }}
        >
          <span className="slash__cmd">{c.cmd}</span>
          <span className="slash__desc">{c.description}</span>
          {c.args && <span className="slash__args">{c.args}</span>}
        </button>
      ))}
    </div>
  );
}
