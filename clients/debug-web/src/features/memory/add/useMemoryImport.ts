import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, useApi } from "@agentic-browser/shared/query";
import { api } from "../../../lib/api";

type Action =
  | { kind: "profile"; linkedin?: string; google?: string; notes?: string }
  | { kind: "linkedin-me" }
  | { kind: "aeroleads"; url: string }
  | { kind: "document"; file: File };

async function run(a: Action): Promise<string> {
  switch (a.kind) {
    case "profile": {
      const r = await api.ingestProfile({ linkedin_text: a.linkedin || undefined, google_profile_text: a.google || undefined, notes: a.notes || undefined, default_trust_level: 8 });
      return `Queued ${r.sources ?? 0} source${r.sources === 1 ? "" : "s"}. New memories appear within a minute.`;
    }
    case "linkedin-me": {
      const r = await api.ingestComposioLinkedInMe({ ingest: true, trust_level: 9 });
      const n = r.ingestion?.claims_created ?? 0;
      return n ? `Imported LinkedIn: ${n} new memories.` : "LinkedIn import queued.";
    }
    case "aeroleads": {
      const r = await api.ingestAeroLeadsLinkedIn({ linkedin_url: a.url, ingest: true, trust_level: 7 });
      const n = r.ingestion?.claims_created ?? 0;
      return n ? `Enriched profile: ${n} new memories.` : "Enrichment queued.";
    }
    case "document": {
      const form = new FormData();
      form.append("file", a.file);
      form.append("source_type", "profile_document");
      form.append("trust_level", "8");
      form.append("title", a.file.name);
      const r = await api.ingestProfileDocument(form);
      return `Queued ${r.filename ?? a.file.name}.`;
    }
  }
}

/** One mutation for every way of adding memories; refreshes memory queries. */
export function useMemoryImport() {
  const { baseUrl } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ab", baseUrl, "memory"] });
      void qc.invalidateQueries({ queryKey: queryKeys.stats(baseUrl) });
    },
  });
}

export type ImportMutation = ReturnType<typeof useMemoryImport>;
