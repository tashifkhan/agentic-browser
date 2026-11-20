import { useEffect, useState, type CSSProperties, type ComponentType, type ReactNode } from "react";
import { ChevronDown, X } from "../icons";

export function SettingsStatusPill({
  ok,
  label,
  onClick,
}: {
  ok: boolean | null;
  label: string;
  onClick?: () => void;
}) {
  const tone = ok === true ? "ab-pill--ok" : ok === false ? "ab-pill--err" : "";
  return (
    <span className={`ab-pill ${tone}`} onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      {typeof label === "string" ? label.toLowerCase() : label}
    </span>
  );
}

export function SettingsSection({
  title,
  icon: Icon,
  defaultOpen = false,
  description,
  aside,
  children,
}: {
  title: string;
  icon?: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  defaultOpen?: boolean;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section
      className="ab-card"
      // Pinned inline so page-level `section {}` rules (the extension has one) can't leak in.
      style={{
        margin: "0 0 10px",
        padding: 0,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-3)",
        boxShadow: "var(--shadow-1)",
        overflow: "hidden",
        transition: "border-color var(--t-fast) var(--ease)",
      }}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: 12,
          padding: "13px 14px",
          background: "transparent",
          border: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {Icon ? (
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: "var(--r-2)",
              display: "grid",
              placeItems: "center",
              background: isOpen ? "var(--accent-soft)" : "var(--hover)",
              color: isOpen ? "var(--accent)" : "var(--text-2)",
              flexShrink: 0,
              transition: "background var(--t-med) var(--ease), color var(--t-med) var(--ease)",
            }}
          >
            <Icon size={15} strokeWidth={1.8} />
          </span>
        ) : null}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 620, color: "var(--text)", letterSpacing: "-0.01em" }}>
            {title}
          </span>
          {description && (
            <span style={{ display: "block", fontSize: 12, color: "var(--text-3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {description}
            </span>
          )}
        </span>
        {aside}
        <ChevronDown
          size={15}
          color="var(--text-3)"
          style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform var(--t-med) var(--ease)", flexShrink: 0 }}
        />
      </button>
      <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows var(--t-med) var(--ease)" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ padding: "4px 14px 14px", borderTop: "1px solid var(--line)" }}>{children}</div>
        </div>
      </div>
    </section>
  );
}

export function SettingsRow({ children, noBorder = false }: { children: ReactNode; noBorder?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        padding: "12px 0",
        borderBottom: noBorder ? "none" : "1px solid var(--line)",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

export function SettingsField({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{hint}</span>}
    </label>
  );
}

/** Inline-style twin of .ab-btn for components that still compose style objects. */
export function settingsButtonStyle(variant: "primary" | "danger" | "ghost" = "ghost"): CSSProperties {
  const common: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 30,
    padding: "0 12px",
    fontSize: 12.5,
    fontWeight: 560,
    borderRadius: "var(--r-2)",
    cursor: "pointer",
    border: "1px solid var(--line-strong)",
    background: "var(--raised)",
    color: "var(--text)",
    whiteSpace: "nowrap",
    transition: "background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease)",
  };
  if (variant === "primary") {
    return { ...common, background: "var(--accent)", color: "var(--accent-ink)", borderColor: "transparent" };
  }
  if (variant === "danger") {
    return { ...common, background: "transparent", color: "var(--err)", borderColor: "var(--line-strong)" };
  }
  return common;
}

export const settingsInputStyle: CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 11px",
  fontSize: 13,
  borderRadius: "var(--r-2)",
  border: "1px solid var(--line-strong)",
  background: "var(--field)",
  color: "var(--text)",
  outline: "none",
  fontFamily: "var(--font-ui)",
};

export function SettingsModal({
  title,
  onClose,
  children,
  zIndex = 1000,
  minWidth = 320,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  zIndex?: number;
  minWidth?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="ab-fade"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="ab-pop"
        style={{
          background: "var(--surface)",
          borderRadius: "var(--r-3)",
          padding: 20,
          minWidth: Math.min(minWidth, 320),
          maxWidth: 520,
          width: "100%",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16 }}>{title}</h3>
          <button type="button" className="ab-btn ab-btn--ghost ab-btn--icon ab-btn--sm" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
