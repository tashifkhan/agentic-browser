import { useRef, useState } from "react";
import { api } from "../../lib/api";
import { isOn } from "./speech";

/** Record from the mic, transcribe on stop, and hand the text back. */
export function useDictation(onText: (text: string, autoSubmit: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const blob = new Blob(chunks, { type: "audio/webm" });
        if (!blob.size) return;
        const form = new FormData();
        form.append("file", blob, "recording.webm");
        try {
          const [config, resp] = await Promise.all([api.integrationsStatus(), fetch("/api/voice/transcribe", { method: "POST", body: form })]);
          if (!resp.ok) throw new Error(await resp.text());
          const data = await resp.json();
          if (data.ok && data.text) onText(data.text.trim(), isOn(config?.voice?.effective?.auto_submit));
        } catch {
          setError("Transcription failed");
        }
      };
      recorder.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setError("Microphone unavailable");
      setListening(false);
    }
  }

  function toggle() {
    if (listening) recorder.current?.state !== "inactive" && recorder.current?.stop();
    else void start();
  }

  return { listening, toggle, error };
}
