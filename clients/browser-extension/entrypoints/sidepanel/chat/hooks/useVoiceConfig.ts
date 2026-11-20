import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueries } from "@agentic-browser/shared/query";

/**
 * Voice settings from the backend (TanStack Query, fetched once), overridden
 * live when the settings sheet broadcasts `voice-config-updated`.
 */
export function useVoiceConfig(): any {
	const { data } = useQuery({ ...useQueries().integrations(), refetchInterval: false });
	const [override, setOverride] = useState<any>(null);

	useEffect(() => {
		const onUpdate = (e: Event) => setOverride((e as CustomEvent).detail);
		window.addEventListener("voice-config-updated", onUpdate);
		return () => window.removeEventListener("voice-config-updated", onUpdate);
	}, []);

	return override ?? data?.voice?.effective ?? null;
}
