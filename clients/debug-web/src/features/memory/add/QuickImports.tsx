import { useRef, useState } from "react";
import { FileText, Link, Upload } from "@agentic-browser/shared/icons";
import { Button } from "@agentic-browser/shared/ui";
import type { ImportMutation } from "./useMemoryImport";

/** One-click sources: LinkedIn, a document, or a profile URL. */
export function QuickImports({ m }: { m: ImportMutation }) {
  const file = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const busy = (kind: string) => m.isPending && m.variables?.kind === kind;

  return (
    <section className="add__section">
      <h4>Import</h4>
      <div className="add__row">
        <Button icon={<Link size={14} />} loading={busy("linkedin-me")} disabled={m.isPending} onClick={() => m.mutate({ kind: "linkedin-me" })}>
          My LinkedIn
        </Button>
        <Button icon={<Upload size={14} />} loading={busy("document")} disabled={m.isPending} onClick={() => file.current?.click()}>
          Upload a document
        </Button>
        <input
          ref={file}
          type="file"
          hidden
          accept=".pdf,.doc,.docx,.txt,.md"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) m.mutate({ kind: "document", file: f });
            e.target.value = "";
          }}
        />
      </div>
      <div className="add__row">
        <FileText size={14} color="var(--text-4)" />
        <input className="ab-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="linkedin.com/in/someone" aria-label="LinkedIn profile URL" />
        <Button loading={busy("aeroleads")} disabled={m.isPending || !url.trim()} onClick={() => m.mutate({ kind: "aeroleads", url: url.trim() })}>
          Enrich
        </Button>
      </div>
    </section>
  );
}
