import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2 } from "@agentic-browser/shared/icons";
import { queryKeys, useApi } from "@agentic-browser/shared/query";
import { Button } from "@agentic-browser/shared/ui";

/**
 * Confirm a memory (full confidence, never decays) or forget it (removed from
 * Postgres, search and the graph). Both refresh the memory views.
 */
export function ClaimActions({ claimId, confirmed, compact = false }: { claimId: string; confirmed: boolean; compact?: boolean }) {
  const { api, baseUrl } = useApi();
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: [...queryKeys.all(baseUrl), "memory"] }),
      qc.invalidateQueries({ queryKey: queryKeys.stats(baseUrl) }),
    ]);
  const confirm = useMutation({ mutationFn: () => api.confirmClaim(claimId), onSuccess: refresh });
  const forget = useMutation({ mutationFn: () => api.forgetClaim(claimId), onSuccess: refresh });
  const failed = confirm.error ?? forget.error;

  return (
    <div className={`claim-actions${compact ? " claim-actions--compact" : ""}`}>
      {!confirmed && (
        <Button size="sm" icon={<Check size={12} />} loading={confirm.isPending} disabled={forget.isPending || confirm.isSuccess} onClick={() => confirm.mutate()}>
          {confirm.isSuccess ? "Confirmed" : "Confirm"}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        icon={<Trash2 size={12} />}
        loading={forget.isPending}
        disabled={confirm.isPending}
        onClick={() => window.confirm("Forget this memory? It is removed from search and the graph.") && forget.mutate()}
      >
        Forget
      </Button>
      {failed && <span className="claim-actions__err">{failed instanceof Error ? failed.message.slice(0, 120) : "Failed"}</span>}
    </div>
  );
}
