import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../ui/Button";
import { useApi } from "../../query/provider";
import { queryKeys } from "../../query/keys";
import { SettingsField as Field, settingsInputStyle as inputStyle } from "../components";
import { Toggle } from "../parts";

/** How long chats are kept inside the model's context window. */
export function CompactionForm() {
  const { api, baseUrl } = useApi();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: queryKeys.compaction(baseUrl), queryFn: api.compaction });
  const s = q.data?.settings;
  const [ratio, setRatio] = useState("");
  const [budget, setBudget] = useState("");
  const [keep, setKeep] = useState("");

  useEffect(() => {
    if (!s) return;
    setRatio(String(Math.round(s.trigger_ratio * 100)));
    setBudget(s.budget_tokens ? String(s.budget_tokens) : "");
    setKeep(String(s.keep_recent));
  }, [s?.trigger_ratio, s?.budget_tokens, s?.keep_recent]);

  const save = useMutation({
    mutationFn: api.compactionSave,
    onSuccess: (d) => qc.setQueryData(queryKeys.compaction(baseUrl), d),
  });
  if (!s) return <p className="set-muted">{q.isError ? "Couldn't load." : "Loading…"}</p>;

  const dirty =
    ratio !== String(Math.round(s.trigger_ratio * 100)) || budget !== (s.budget_tokens ? String(s.budget_tokens) : "") || keep !== String(s.keep_recent);

  return (
    <div>
      <div className="set-row">
        <Toggle
          checked={s.enabled}
          onChange={(v) => save.mutate({ enabled: v })}
          label="Summarise older messages when a chat outgrows the context window"
        />
      </div>
      <p className="set-muted">
        The whole chat is sent while it fits. Past the budget, the recent messages stay word for word and older ones become
        running notes, kept with the chat. Budget now: {q.data!.budget_tokens.toLocaleString()} tokens.
      </p>
      <div className="set-grid">
        <Field label="Budget (% of the model's window)">
          <input value={ratio} onChange={(e) => setRatio(e.target.value)} inputMode="numeric" style={inputStyle} />
        </Field>
        <Field label="Or a fixed budget (tokens)">
          <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" placeholder="auto" style={inputStyle} />
        </Field>
        <Field label="Recent messages kept verbatim">
          <input value={keep} onChange={(e) => setKeep(e.target.value)} inputMode="numeric" style={inputStyle} />
        </Field>
      </div>
      {dirty && (
        <div className="set-actions">
          <Button
            size="sm"
            variant="primary"
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                trigger_ratio: Math.min(0.95, Math.max(0.05, (parseFloat(ratio) || 50) / 100)),
                budget_tokens: budget ? parseInt(budget, 10) || null : null,
                keep_recent: Math.max(2, parseInt(keep, 10) || 8),
              })
            }
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
