export type PersistedSession = {
    id: string;
    title: string;
    messages: any[];
    updatedAt: string;
};

export async function getApiBaseUrl(): Promise<string> {
    const storage = (await browser.storage.local.get("baseUrl")) as { baseUrl?: string };
    return storage.baseUrl || import.meta.env.VITE_API_URL || "http://localhost:5454";
}

export async function loadServerSessions(): Promise<PersistedSession[]> {
    const baseUrl = await getApiBaseUrl();
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/state/sessions`);
    if (!response.ok) {
        throw new Error(`Failed to load sessions: ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data.sessions) ? data.sessions : [];
}

export async function saveServerSessions(sessions: PersistedSession[]): Promise<void> {
    const baseUrl = await getApiBaseUrl();
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/state/sessions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions }),
    });
    if (!response.ok) {
        throw new Error(`Failed to save sessions: ${response.status}`);
    }
}

export async function deleteServerSession(sessionId: string): Promise<void> {
    const baseUrl = await getApiBaseUrl();
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/state/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
    });
    if (!response.ok) {
        throw new Error(`Failed to delete session: ${response.status}`);
    }
}
