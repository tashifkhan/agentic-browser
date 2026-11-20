import { useRef, useState } from "react";
import { browser } from "wxt/browser";
import { BACKEND_URL } from "../types";

/**
 * Dictation: records from the mic, sends the audio to /api/voice/transcribe,
 * and hands back the text plus whether the user enabled auto-submit.
 * A denied permission opens the microphone setup page.
 */
export function useVoiceInput({
	onTranscript,
	onError,
}: {
	onTranscript: (text: string, autoSubmit: boolean) => void;
	onError: (message: string | null) => void;
}) {
	const [isListening, setIsListening] = useState(false);
	const recorder = useRef<MediaRecorder | null>(null);
	const chunks = useRef<Blob[]>([]);

	const toggle = async () => {
		if (isListening) {
			if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
			setIsListening(false);
			return;
		}
		onError(null);
		setIsListening(true);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const rec = new MediaRecorder(stream);
			recorder.current = rec;
			chunks.current = [];
			rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
			rec.onstop = async () => {
				const blob = new Blob(chunks.current, { type: "audio/webm" });
				stream.getTracks().forEach((t) => t.stop());
				if (blob.size === 0) return setIsListening(false);
				try {
					const form = new FormData();
					form.append("file", blob, "recording.webm");
					// Fetch fresh config alongside the upload so auto-submit reflects the latest setting.
					const [config, resp] = await Promise.all([
						fetch(`${BACKEND_URL}/api/integrations/status`).then((r) => r.json()),
						fetch(`${BACKEND_URL}/api/voice/transcribe`, { method: "POST", body: form }),
					]);
					if (!resp.ok) throw new Error(`Transcription failed: ${await resp.text()}`);
					const data = await resp.json();
					const cfg = config?.voice?.effective;
					const auto = cfg?.auto_submit === true || cfg?.auto_submit === "true";
					if (data.ok && data.text) onTranscript(String(data.text).trim(), auto);
				} catch (err: any) {
					onError(`Voice transcription failed: ${err.message}`);
				} finally {
					setIsListening(false);
				}
			};
			rec.start();
		} catch (err: any) {
			if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
				onError("Microphone access denied. Opening setup page...");
				setTimeout(() => {
					browser.tabs.create({ url: browser.runtime.getURL("/voice-setup.html" as any), active: true });
				}, 1500);
			} else {
				onError(`Could not access microphone: ${err.message}`);
			}
			setIsListening(false);
		}
	};

	return { isListening, toggle };
}
