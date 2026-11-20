import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "@agentic-browser/shared/icons";

export function BackLink({ to, children }: { to: "/runs" | "/diagnostics"; children: string }) {
  return (
    <div>
      <Link to={to} className="ab-btn ab-btn--ghost ab-btn--sm" style={{ marginLeft: -8, textDecoration: "none" }}>
        <ArrowLeft size={14} /> {children}
      </Link>
    </div>
  );
}
