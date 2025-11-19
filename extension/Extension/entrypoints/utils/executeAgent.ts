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
        "jportalData",
        // get chat history here
    ]);


    const baseUrl = import.meta.env.VITE_API_URL || "";
    let tabContext = "";
    try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            const activeTab = tabs[0];
            tabContext = `${activeTab.title}`;
        }
    } catch (e) {
        console.log("Could not fetch active tab info", e);
    }
    const googleUser = storage.googleUser || null;
    const jportal = {
        id: storage.jportalId || null,
        pass: storage.jportalPass || null,
    };

    const finalUrl = (baseUrl + endpoint)
        .replace(/\/{2,}/g, "/")
        .replace("http:/", "http://")
        .replace("https:/", "https://");
    let payload: any;
    if (endpoint === "/api/genai/react") {
        payload = {
            question: `${tabContext} ${prompt}`,
            chat_history: [],
            google_access_token: googleUser?.token || "",
            pyjiit_login_response: storage.jportalData || null
        };
    }
    else if (endpoint === "/api/pyjiit/semesters" || endpoint === "/api/pyjiit/attendance") {
        payload = {
            portalData: storage.jportalData || null
        };
    }
    else {
        payload = {
            url: `${tabContext}`,
            question: `${prompt}`,
            chat_history: [],
            query: `${prompt}`,
            access_token: googleUser?.token || "",
            max_results: 5,
            to: "",
            subject: "",
            body: "",
            summary: "",
            start_time: "",
            end_time: "",
            description: "",
            portalData: storage.jportalData || null,
        };
    }

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
