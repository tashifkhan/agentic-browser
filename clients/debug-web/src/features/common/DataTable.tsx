import type { ComponentType, CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "@agentic-browser/shared/icons";
import { Skeleton } from "@agentic-browser/shared/ui";

export type Column<T> = {
  key: string;
  header: ReactNode;
  /** CSS grid track, e.g. "96px" or "minmax(0, 2fr)". */
  width: string;
  align?: "start" | "end";
  render: (row: T) => ReactNode;
};

type RowLink = { to: string; params?: Record<string, string> };

// Row targets are computed per row, which the router's literal route types
// can't express, so the link component is used untyped here.
const RowAnchor = Link as unknown as ComponentType<Record<string, unknown>>;

/**
 * Grid-based table. Rows become real links when `link` is given, so
 * cmd-click and middle-click open them in a new tab.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  link,
  onRowHover,
  label,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  link?: (row: T) => RowLink;
  onRowHover?: (row: T) => void;
  label: string;
}) {
  const template = `${columns.map((c) => c.width).join(" ")}${link ? " 16px" : ""}`;
  const style: CSSProperties = { gridTemplateColumns: template };
  return (
    <div className="pn-table ab-fade" role="table" aria-label={label}>
      <div className="pn-thead" role="row" style={style}>
        {columns.map((c) => (
          <span key={c.key} role="columnheader" className={c.align === "end" ? "pn-right" : undefined}>
            {c.header}
          </span>
        ))}
        {link && <span />}
      </div>
      {rows.map((row) => {
        const cells = columns.map((c) => (
          <span key={c.key} role="cell" className={c.align === "end" ? "pn-right pn-cellwrap" : "pn-cellwrap"}>
            {c.render(row)}
          </span>
        ));
        if (!link) {
          return (
            <div key={rowKey(row)} role="row" className="pn-row" style={style}>
              {cells}
            </div>
          );
        }
        const { to, params } = link(row);
        return (
          <RowAnchor
            key={rowKey(row)}
            role="row"
            className="pn-row"
            style={style}
            to={to}
            params={params}
            onMouseEnter={onRowHover ? () => onRowHover(row) : undefined}
            onFocus={onRowHover ? () => onRowHover(row) : undefined}
          >
            {cells}
            <ChevronRight size={14} className="pn-row__go" />
          </RowAnchor>
        );
      })}
    </div>
  );
}

/** Loading rows shaped like the real table. */
export function TableSkeleton({ columns, rows = 8 }: { columns: { header: ReactNode; width: string; align?: "start" | "end" }[]; rows?: number }) {
  const style: CSSProperties = { gridTemplateColumns: columns.map((c) => c.width).join(" ") };
  return (
    <div className="pn-table" aria-busy="true" aria-label="Loading">
      <div className="pn-thead" style={style}>
        {columns.map((c, i) => (
          <span key={i} className={c.align === "end" ? "pn-right" : undefined}>{c.header}</span>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div className="pn-row" key={r} style={style}>
          {columns.map((c, i) => (
            <Skeleton key={i} width={i === 0 ? 72 : `${80 - ((r + i) % 4) * 14}%`} height={i === 0 ? 18 : 10} style={c.align === "end" ? { justifySelf: "end", width: 44 } : i === 0 ? { borderRadius: 999 } : undefined} />
          ))}
        </div>
      ))}
    </div>
  );
}
