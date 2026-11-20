import { useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { loadServerSessions, saveServerSessions } from "../../../utils/serverState";
import { api } from "../../lib/api";
import { newSession, type ChatMessage, type Session } from "../types";

const byRecent = (a: Session, b: Session) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

/**
 * Chat sessions: loaded from Postgres first, then the local cache (and the
 * legacy `chatHistory` key) as migration and offline fallback. Every change is
 * written back to both. Mutators take the session id explicitly so a
 * streaming run keeps writing to the session it started in.
 */
export function useSessions() {
	const [sessions, setSessions] = useState<Session[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const loaded = useRef(false);
	const counter = useRef(0);

	const newChat = () => {
		const fresh = newSession();
		loaded.current = true;
		setSessions((prev) => [fresh, ...prev]);
		setActiveSessionId(fresh.id);
	};

	const adopt = (list: Session[]) => {
		const sorted = [...list].sort(byRecent);
		setSessions(sorted);
		setActiveSessionId(sorted[0].id);
	};

	useEffect(() => {
		(async () => {
			try {
				const server = await loadServerSessions();
				if (server.length > 0) {
					adopt(server as Session[]);
					loaded.current = true;
					return;
				}
				const local = await browser.storage.local.get(["sessions", "chatHistory"]);
				if (Array.isArray(local.sessions) && local.sessions.length > 0) {
					adopt(local.sessions as Session[]);
					await saveServerSessions(local.sessions as Session[]);
				} else if (Array.isArray(local.chatHistory) && local.chatHistory.length > 0) {
					const legacy: Session = { ...newSession(), title: "Previous Chat", messages: local.chatHistory as ChatMessage[] };
					adopt([legacy]);
					await saveServerSessions([legacy]);
					browser.storage.local.remove("chatHistory");
				} else {
					newChat();
				}
				loaded.current = true;
			} catch (error) {
				console.error("Failed to load server history:", error);
				const local = await browser.storage.local.get(["sessions"]);
				if (Array.isArray(local.sessions) && local.sessions.length > 0) {
					adopt(local.sessions as Session[]);
					loaded.current = true;
					return;
				}
				newChat();
			}
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (sessions.length === 0 || !loaded.current) return;
		saveServerSessions(sessions).catch((error) => console.error("Failed to save server sessions:", error));
		browser.storage.local.set({ sessions }).catch((error) => console.error("Failed to save local session cache:", error));
	}, [sessions]);

	const patch = (sessionId: string | null, fn: (s: Session) => Session) =>
		setSessions((prev) => (sessionId ? prev.map((s) => (s.id === sessionId ? fn(s) : s)) : prev));

	const addMessage = (sessionId: string | null, msg: ChatMessage) =>
		setSessions((prev) => {
			if (!sessionId) return prev;
			return prev
				.map((s) => {
					if (s.id !== sessionId) return s;
					// The first user message names the chat.
					const title =
						s.messages.length === 0 && msg.role === "user"
							? msg.content.slice(0, 30) + (msg.content.length > 30 ? "..." : "")
							: s.title;
					return { ...s, title, messages: [...s.messages, msg], updatedAt: new Date().toISOString() };
				})
				.sort(byRecent);
		});

	const updateMessage = (sessionId: string | null, messageId: string, content: string) =>
		patch(sessionId, (s) => ({
			...s,
			messages: s.messages.map((m) => (m.id === messageId ? { ...m, content } : m)),
			updatedAt: new Date().toISOString(),
		}));

	const pushEvent = (sessionId: string | null, messageId: string, type: string, label: string) => {
		counter.current += 1;
		const event = {
			id: `${Date.now()}-${counter.current}-${Math.random().toString(36).slice(2, 7)}`,
			type,
			label,
			timestamp: new Date().toISOString(),
		};
		patch(sessionId, (s) => ({
			...s,
			messages: s.messages.map((m) => (m.id === messageId ? { ...m, events: [...(m.events || []), event] } : m)),
			updatedAt: new Date().toISOString(),
		}));
	};

	const linkServerConversation = (sessionId: string | null, conversationId: string, title?: string) =>
		patch(sessionId, (s) => ({ ...s, serverConversationId: conversationId, title: title || s.title }));

	const deleteSession = async (sessionId: string) => {
		if (!confirm("Delete this thread permanently?")) return;
		try {
			await api.deleteSession(sessionId);
			setSessions((prev) => {
				const rest = prev.filter((s) => s.id !== sessionId);
				if (sessionId !== activeSessionId) return rest;
				if (rest.length > 0) {
					setActiveSessionId(rest[0].id);
					return rest;
				}
				const fresh = newSession();
				setActiveSessionId(fresh.id);
				return [fresh];
			});
		} catch {
			alert("Failed to delete thread from server");
		}
	};

	const activeSession = sessions.find((s) => s.id === activeSessionId);

	return {
		sessions,
		activeSession,
		activeSessionId,
		activeMessages: activeSession?.messages ?? [],
		setActiveSessionId,
		newChat,
		deleteSession,
		addMessage,
		updateMessage,
		pushEvent,
		linkServerConversation,
	};
}

export type SessionsApi = ReturnType<typeof useSessions>;
