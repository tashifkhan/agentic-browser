export type VoiceConfig = {
  tts_provider?: string;
  tts_voice?: string;
  auto_speak?: boolean | string;
  auto_submit?: boolean | string;
};

let currentAudio: HTMLAudioElement | null = null;

export function stopSpeech() {
  currentAudio?.pause();
  currentAudio = null;
  window.speechSynthesis?.cancel();
}

function plain(text: string) {
  return text.replace(/<[^>]*>?/gm, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

/**
 * Read text aloud with the configured provider, falling back to the browser
 * voice. Calls onPlaying when audio starts and onDone when it stops.
 */
export async function speak(text: string, config: VoiceConfig | null, onPlaying: () => void, onDone: () => void) {
  stopSpeech();
  const words = plain(text);
  const native = () => {
    onPlaying();
    const ut = new SpeechSynthesisUtterance(words);
    ut.onend = onDone;
    const wanted = config?.tts_voice;
    if (wanted) {
      const voice = window.speechSynthesis.getVoices().find((v) => v.name === wanted || v.lang.startsWith(wanted));
      if (voice) ut.voice = voice;
    }
    window.speechSynthesis.speak(ut);
  };
  if (!config?.tts_provider || config.tts_provider === "browser_native") return native();
  try {
    const resp = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: words }),
    });
    if (!resp.ok) return native();
    const audio = new Audio(URL.createObjectURL(await resp.blob()));
    currentAudio = audio;
    audio.onended = onDone;
    onPlaying();
    await audio.play().catch(native);
  } catch {
    native();
  }
}

export const isOn = (v: boolean | string | undefined) => String(v) === "true";
