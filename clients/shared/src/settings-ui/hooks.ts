import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../query/keys";
import { useApi } from "../query/provider";

/** Refetch the integrations status after a settings change. */
export function useRefreshIntegrations() {
  const qc = useQueryClient();
  const { baseUrl } = useApi();
  return () => qc.invalidateQueries({ queryKey: queryKeys.integrations(baseUrl) });
}

/**
 * useMutation for settings writes: refreshes the integrations status on
 * success, then runs `onDone` (close a modal, clear a field...).
 */
export function useSettingsMutation<TVars = void, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  onDone?: (data: TData) => void,
) {
  const refresh = useRefreshIntegrations();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (data) => {
      await refresh();
      onDone?.(data);
    },
  });
}
