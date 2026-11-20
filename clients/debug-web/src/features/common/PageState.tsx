import type { ReactNode } from "react";
import { StateView } from "@agentic-browser/shared/ui";

/** Empty state framed as a dashed panel, for whole-page "nothing here" moments. */
export function PageEmpty({ icon, title, body, action }: { icon: ReactNode; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="pn-state ab-dotgrid">
      <StateView icon={icon} title={title} body={body} action={action} style={{ padding: "56px 24px" }} />
    </div>
  );
}

/** Wraps QueryView's error output in the same dashed frame. */
export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="pn-state ab-dotgrid" style={{ padding: "16px 0" }}>{children}</div>;
}
