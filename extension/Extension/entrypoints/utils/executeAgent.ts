import { AGENT_MAP, AgentKey, AgentActionKey } from "../sidepanel/lib/agent-map";
import { parseAgentCommand } from "./parseAgentCommand";

export async function executeAgent(fullCommand: string, prompt: string) {
    const parsed = parseAgentCommand(fullCommand);
    if (!parsed || parsed.stage !== "complete") {
        throw new Error("Command not complete or invalid");
    }

    // ----- FIXED TYPED INDEXING -----
    const a = parsed.agent as AgentKey;
    const act = parsed.action as AgentActionKey<typeof a>;
    const endpoint = AGENT_MAP[a].actions[act];
    // --------------------------------

    // read stored items
    const storage = await browser.storage.local.get([
        "baseUrl",
        "googleUser",
        "jportalId",
        "jportalPass",
    ]);

    const baseUrl = import.meta.env.VITE_API_URL || "";
    console.log("Base URL:", baseUrl);
    const googleUser = storage.googleUser || null;
    const jportal = {
        id: storage.jportalId || null,
        pass: storage.jportalPass || null,
    };

    const finalUrl = (baseUrl + endpoint)
        .replace(/\/{2,}/g, "/")
        .replace("http:/", "http://")
        .replace("https:/", "https://");
    const payload = {
        agent: a,
        action: act,
        prompt,
        googleUser: googleUser || null,
        jportal: {
            id: jportal.id || null,
            pass: jportal.pass || null,
        },
        meta: {
            extension: "agentic-browser",
            timestamp: new Date().toISOString(),
            url: window.location.href
        },
    };

    // alert(`Target URL: ${finalUrl}`);
    // alert(`Payload:\n${JSON.stringify(payload, null, 2)}`);
    // Google search = GET
    if (endpoint === "/api/google-search") {
        const url = new URL(finalUrl, window.location.origin);
        if (prompt) url.searchParams.set("q", prompt);
        const resp = await fetch(url.toString(), { method: "GET" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
        return await resp.json();
    }

    // Default POST
    const resp = await fetch(finalUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errText}`);
    }

    return await resp.json();
}
