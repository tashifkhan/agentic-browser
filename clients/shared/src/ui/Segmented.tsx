import type { ReactNode } from "react";

export type SegmentOption<T extends string> = { value: T; label: ReactNode; icon?: ReactNode; count?: number };

/** Radio-group style switch: filters, view modes, theme. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={`seg${size === "sm" ? " seg--sm" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={`seg__item${on ? " is-on" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.icon}
            {o.label}
            {o.count !== undefined && <span className="seg__count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
