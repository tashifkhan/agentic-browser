import { useState } from "react";
import { Database, Trash2 } from "../../icons";
import { Button } from "../../ui/Button";
import { useApi } from "../../query/provider";
import { useStats } from "../../query/hooks";
import { SettingsSection as Section } from "../components";
import { KeyList } from "../parts";
import { useSettingsMutation } from "../hooks";

/** Memory counts plus a confirm-twice wipe. */
export function MemorySection() {
  const { api } = useApi();
  const stats = useStats();
  const [confirming, setConfirming] = useState(false);
  const wipe = useSettingsMutation(() => api.memoryClear(), () => {
    setConfirming(false);
    stats.refetch();
  });
  const m = stats.data?.memory;

  return (
    <Section title="Memory" icon={Database} description={m ? `${m.total_active} memories from ${m.sources} sources` : undefined}>
      <KeyList
        rows={[
          { key: "short", label: "Short-term", value: <span className="ab-mono">{m?.short_term ?? "-"}</span> },
          { key: "long", label: "Long-term", value: <span className="ab-mono">{m?.long_term ?? "-"}</span> },
          { key: "perm", label: "Permanent", value: <span className="ab-mono">{m?.permanent ?? "-"}</span> },
          { key: "src", label: "Sources", value: <span className="ab-mono">{m?.sources ?? "-"}</span> },
        ]}
      />
      <div className="set-actions">
        {confirming ? (
          <>
            <span className="set-note set-note--err">This deletes every memory and can't be undone.</span>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep</Button>
            <Button size="sm" variant="danger" loading={wipe.isPending} onClick={() => wipe.mutate()}>Delete all</Button>
          </>
        ) : (
          <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => setConfirming(true)}>Delete all memories</Button>
        )}
      </div>
    </Section>
  );
}
