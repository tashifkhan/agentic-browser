import { useEffect, useRef, useState } from "react";
import { speakableText } from "../content";
import { BACKEND_URL, type ChatMessage } from "../types";

/**
 * Read-aloud for agent replies. Uses the backend TTS provider when one is
 * configured and falls back to the browser voice. With `auto_speak` on, new
 * replies are spoken sentence by sentence as they stream in.
 *
 * `playingId` is the message being spoken, or `loading-<id>` while audio loads.
 */
export function useSpeech(voiceConfig: any, messages: ChatMessage[]) {
	const [playingId, setPlayingId] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const charIndex = useRef(0);
	const queue = useRef<string[]>([]);
	const busy = useRef(false);
	const lastMsgId = useRef("");

	const pickVoice = (ut: SpeechSynthesisUtterance) => {
		if (!voiceConfig?.tts_voice) return;
		const voice = window.speechSynthesis
			.getVoices()
			.find((v) => v.name === voiceConfig.tts_voice || v.lang.startsWith(voiceConfig.tts_voice));
		if (voice) ut.voice = voice;
	};

	const stopAll = () => {
		audioRef.current?.pause();
		audioRef.current = null;
		window.speechSynthesis.cancel();
	};

	const playQueue = async (msgId: string) => {
		if (busy.current || queue.current.length === 0) return;
		busy.current = true;
		const sentence = queue.current.shift()!;
		const next = () => {
			busy.current = false;
			setPlayingId(null);
			if (queue.current.length > 0) playQueue(msgId);
		};
		const native = () => {
			setPlayingId(msgId);
			const ut = new SpeechSynthesisUtterance(sentence);
			ut.onend = next;
			ut.onerror = next;
			pickVoice(ut);
			window.speechSynthesis.speak(ut);
		};
		if (!voiceConfig || voiceConfig.tts_provider === "browser_native" || !voiceConfig.tts_provider) return native();
		try {
			setPlayingId(`loading-${msgId}`);
			const resp = await fetch(`${BACKEND_URL}/api/voice/speak`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: sentence }),
			});
			if (!resp.ok) return native();
			setPlayingId(msgId);
			const audio = new Audio(URL.createObjectURL(await resp.blob()));
			audioRef.current = audio;
			audio.onended = next;
			audio.onerror = next;
			audio.play().catch(native);
		} catch {
			native();
		}
	};

	// Auto-speak the streaming reply.
	useEffect(() => {
		const auto = voiceConfig?.auto_speak === true || voiceConfig?.auto_speak === "true";
		if (!auto) {
			stopAll();
			setPlayingId(null);
			queue.current = [];
			busy.current = false;
			return;
		}
		const last = messages[messages.length - 1];
		if (!last || last.role !== "assistant") return;
		const lower = last.content?.toLowerCase() ?? "";
		const isError =
			last.events?.some((e) => e.type === "error" || e.type === "exception") ||
			lower.includes("**[error") ||
			lower.includes("failed to get response") ||
			lower.includes("exception");
		if (isError) return;

		if (lastMsgId.current !== last.id) {
			lastMsgId.current = last.id;
			charIndex.current = 0;
			stopAll();
			queue.current = [];
			busy.current = false;
		}

		const content = speakableText(last.content || "");
		const fresh = content.substring(charIndex.current);
		const sentence = /[^.!?\n]+[.!?\n]+(?=\s|$)/g;
		let m;
		let end = 0;
		while ((m = sentence.exec(fresh)) !== null) {
			const s = m[0].trim();
			if (s.length > 1) queue.current.push(s);
			end = m.index + m[0].length;
		}
		charIndex.current += end;

		const done = last.events?.some((e) => e.type === "final");
		if (done && charIndex.current < content.length) {
			const rest = content.substring(charIndex.current).trim();
			if (rest) queue.current.push(rest);
			charIndex.current = content.length;
		}
		if (!busy.current && queue.current.length > 0) playQueue(last.id);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [messages, voiceConfig]);

	/** Toggle reading one message aloud. */
	const speak = (msg: ChatMessage) => {
		if (playingId === msg.id) {
			stopAll();
			setPlayingId(null);
			return;
		}
		setPlayingId(`loading-${msg.id}`);
		const text = speakableText(msg.content);
		const native = () => {
			setPlayingId(msg.id);
			const ut = new SpeechSynthesisUtterance(text);
			ut.onend = () => setPlayingId(null);
			pickVoice(ut);
			window.speechSynthesis.speak(ut);
		};
		if (!voiceConfig || voiceConfig.tts_provider === "browser_native") return native();
		fetch(`${BACKEND_URL}/api/voice/speak`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text }),
		})
			.then(async (resp) => {
				if (!resp.ok) return native(); // includes 429 from the TTS provider
				setPlayingId(msg.id);
				const audio = new Audio(URL.createObjectURL(await resp.blob()));
				audioRef.current = audio;
				audio.onended = () => setPlayingId(null);
				audio.play().catch(native);
			})
			.catch(native);
	};

	return { playingId, speak };
}
