import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@agentic-browser/shared/api";
import { isOn, speak, stopSpeech, type VoiceConfig } from "./speech";

export type SpeakState = "idle" | "loading" | "playing";

/** Which message is being read aloud, plus auto-speak for new replies. */
export function useSpeaker(config: VoiceConfig | null, messages: ChatMessage[]) {
  const [active, setActive] = useState<{ id: string; state: SpeakState } | null>(null);
  const lastSpoken = useRef("");

  const toggle = useCallback(
    (id: string, text: string) => {
      if (active?.id === id) {
        stopSpeech();
        setActive(null);
        return;
      }
      setActive({ id, state: "loading" });
      void speak(text, config, () => setActive({ id, state: "playing" }), () => setActive(null));
    },
    [active, config],
  );

  useEffect(() => {
    if (!isOn(config?.auto_speak)) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.message_id === lastSpoken.current) return;
    if ((last.content || "").length < 10 || /\*\*\[error|failed to get response/i.test(last.content)) return;
    lastSpoken.current = last.message_id;
    toggle(last.message_id, last.content);
    // Only react to new messages, not to toggle's identity changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, config?.auto_speak]);

  useEffect(() => () => stopSpeech(), []);

  return { stateFor: (id: string): SpeakState => (active?.id === id ? active.state : "idle"), toggle };
}
