import { useRef, type InputHTMLAttributes } from "react";
import { Search, X } from "../icons";

/** Text filter with an icon, a clear button and Esc-to-clear. */
export function SearchField({
  value,
  onChange,
  placeholder = "Search",
  label,
  width,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  width?: number | string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className="search-field" style={{ width }}>
      <Search size={14} />
      <input
        ref={ref}
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
          rest.onKeyDown?.(e);
        }}
        {...rest}
      />
      {value && (
        <button type="button" className="search-field__clear" aria-label="Clear" onClick={() => { onChange(""); ref.current?.focus(); }}>
          <X size={12} />
        </button>
      )}
    </label>
  );
}
