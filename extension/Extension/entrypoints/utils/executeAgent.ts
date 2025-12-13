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
                tabContext = `Tab: ${activeTab.title} (URL: ${activeTab.url})`;
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
    else if (endpoint === "/api/genai/youtube" || endpoint === "/api/genai/website" || endpoint === "/api/genai/github") {
        payload = {
            url: explicitUrl || "",
            question: userQuestion || prompt,
            chat_history: chatHistory || [],
        };
    }
    else if (endpoint === "/api/agent/generate-script") {
        let domStructure = {};
        try {
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0 && tabs[0].id) {
                // Execute script to get DOM info
                const results = await browser.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    func: () => {
                        const interactive: any[] = [];
                        // Simple heuristic for interactive elements
                        const elements = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
                        
                        // Helper to check visibility
                        function isVisible(el: Element) {
                            if (!el.checkVisibility) return true; // Fallback
                            return el.checkVisibility();
                        }

                        for (const el of elements) {
                            if (!isVisible(el)) continue;
                            
                            // Safe attribute extraction
                            interactive.push({
                                tag: el.tagName.toLowerCase(),
                                id: el.id || "",
                                class: el.className || "",
                                type: (el as HTMLInputElement).type || "",
                                placeholder: (el as HTMLInputElement).placeholder || "",
                                name: (el as HTMLInputElement).name || "",
                                ariaLabel: el.getAttribute('aria-label') || "",
                                text: (el as HTMLElement).innerText || el.textContent || ""
                            });
                        }

                        return {
                            url: window.location.href,
                            title: document.title,
                            interactive: interactive.slice(0, 200), // Limit to avoid massive payloads
                            raw_html: document.documentElement.outerHTML
                        };
                    }
                });

                if (results && results[0] && results[0].result) {
                    domStructure = results[0].result;
                }
            }
        } catch (e) {
            console.error("Failed to extract DOM", e);
        }

        payload = {
            goal: prompt,
            target_url: explicitUrl || "",
            dom_structure: domStructure, 
            constraints: {}
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
