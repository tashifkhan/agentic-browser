import { AGENT_MAP, AgentKey, AgentActionKey } from "../sidepanel/lib/agent-map";
import { parseAgentCommand } from "./parseAgentCommand";

function parsePromptInput(inputText: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urlMatch = inputText.match(urlRegex);

    const extractedUrl = urlMatch ? urlMatch[0] : null;
    // Remove the URL from the text to get the "clean" prompt
    const cleanText = inputText.replace(urlRegex, "").trim();

    return {
        url: extractedUrl,
        text: cleanText
    };
}
export async function executeAgent(fullCommand: string, prompt: string, chatHistory: any[] = []) {
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
        "jportalId",
        "jportalPass",
        "jportalData"
    ]);
    const baseUrl = import.meta.env.VITE_API_URL || "";
    let tabContext = "";
    
    // Check for mentions in the prompt
    const mentionMatch = prompt.match(/@([^\s]+)/);
    let usedMention = false;

    if (mentionMatch) {
        try {
            const mentionedTitle = mentionMatch[1];
            const allTabs = await browser.tabs.query({});
            const matchedTab = allTabs.find(t => t.title && t.title.includes(mentionedTitle));
            
            if (matchedTab) {
                tabContext = `Tab: ${matchedTab.title} (URL: ${matchedTab.url})`;
                usedMention = true;
                console.log("Using mentioned tab context:", matchedTab.title);
            }
        } catch (e) {
            console.error("Failed to resolve mention:", e);
        }
    }

    // If no mention was used/found, validly fall back to active tab
    if (!usedMention) {
        try {
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                const activeTab = tabs[0];
                tabContext = `${activeTab.title}`;
            }
        } catch (e) {
            console.log("Could not fetch active tab info", e);
        }
    }
    const { url: explicitUrl, text: userQuestion } = parsePromptInput(prompt);
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
            chat_history: chatHistory || [],
            google_access_token: googleUser?.token || "",
            pyjiit_login_response: storage.jportalData || null
        };
    }
    else if (endpoint === "/api/pyjiit/semesters" || endpoint === "/api/pyjiit/attendence") {
        const j = storage.jportalData;
        if (!j) throw new Error("Portal data missing");

        payload = j;
    }
    else if (endpoint == "/api/genai/youtube" || endpoint == "/api/genai/website" || endpoint == "/api/genai/github") {
        payload = {
            url: explicitUrl || "",
            question: userQuestion || prompt,
            chat_history: chatHistory || [],
        };
    }
    else {
        payload = {
            url: `${prompt}`,
            question: `${prompt}`,
            chat_history: chatHistory || [],
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
    // now if condition that if 3 enpoints are of get request then use get else post

    if (endpoint === "/api/genai/health/" || endpoint === "/api/google-search/" || endpoint === "/") {
        const resp = await fetch(finalUrl, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`HTTP ${resp.status}: ${errText}`);
        }
        const data = await resp.json();
        return data;
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
    const data = await resp.json();
    return data;
}
