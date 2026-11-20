import { useEffect, useState } from "react";
import { useIntegrations } from "@agentic-browser/shared/query";
import type { VoiceConfig } from "./speech";

/** Voice settings from the backend, updated live when Settings saves new ones. */
export function useVoiceConfig(): VoiceConfig | null {
  const { data } = useIntegrations();
  const [override, setOverride] = useState<VoiceConfig | null>(null);
  useEffect(() => {
    const onUpdate = (e: Event) => setOverride((e as CustomEvent).detail);
    window.addEventListener("voice-config-updated", onUpdate);
    return () => window.removeEventListener("voice-config-updated", onUpdate);
  }, []);
  return override ?? ((data?.voice?.effective as VoiceConfig | undefined) ?? null);
}
