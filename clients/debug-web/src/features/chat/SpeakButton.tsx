import { Loader2, Volume2 } from "@agentic-browser/shared/icons";
import type { SpeakState } from "./useSpeaker";

export function SpeakButton({ state, onClick }: { state: SpeakState; onClick: () => void }) {
  const cls = ["speak-btn", state === "playing" && "is-playing", state === "loading" && "is-loading"].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} onClick={onClick} disabled={state === "loading"}>
      {state === "playing" ? (
        <>
          <span className="speak-bars">
            <span className="speak-bar" />
            <span className="speak-bar" />
            <span className="speak-bar" />
          </span>
          Stop
        </>
      ) : state === "loading" ? (
        <>
          <Loader2 size={11} className="spin" /> Loading
        </>
      ) : (
        <>
          <Volume2 size={11} /> Read aloud
        </>
      )}
    </button>
  );
}
