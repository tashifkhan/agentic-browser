import { AGENT_MAP, AgentKey, AgentActionKey } from "../sidepanel/lib/agent-map";
import { parseAgentCommand } from "./parseAgentCommand";
import {
    ActionExecutionResult,
    BrowserAction,
    capturePageSnapshot,
    executeAutomationActions,
    PageSnapshot,
} from "./executeActions";

type StoredGoogleUser = {
    token?: string;
};

export type AgentStreamEvent = {
    event: string;
    data: any;
};

type ExtensionStorage = {
    baseUrl?: string;
    googleUser?: StoredGoogleUser;
    jportalId?: string;
    jportalPass?: string;
    jportalData?: any;
};

type BrowserRuntimeStepResponse = {
    session_id: string;
    step: number;
    done: boolean;
    status: string;
    message?: string;
    action?: BrowserAction | null;
    expected_state?: string;
    verification?: string;
    reason?: string;
    requires_user_input?: boolean;
    conversation_id?: string | null;
    run_id?: string | null;
};

async function getExtensionBaseUrl(): Promise<string> {
    const storage = (await browser.storage.local.get(["baseUrl"])) as ExtensionStorage;
    return storage.baseUrl || import.meta.env.VITE_API_URL || "http://localhost:5454";
}

/**
 * Sync a browser runtime run to the backend conversations API so it
 * appears in the debug view's chat and runs panels.
 */
async function syncBrowserRuntimeToConversation(
    baseUrl: string,
    goal: string,
    answer: string,
    conversationId?: string | null,
    onStreamEvent?: (event: AgentStreamEvent) => void | Promise<void>,
): Promise<string | null> {
    const base = baseUrl.replace(/\/$/, "");
    try {
        // 1. Create or reuse a conversation
        let convId = conversationId;
        if (!convId) {
            const createResp = await fetch(`${base}/api/conversations`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: goal.slice(0, 60),
                    client_id: "browser-extension",
                }),
            });
            if (createResp.ok) {
                const data = await createResp.json();
                convId = data.conversation_id;
            }
        }
        if (!convId) return null;

        // 2. Emit the conversation event so the extension can track the ID
        await onStreamEvent?.({
            event: "conversation",
            data: { conversation_id: convId },
        });

        // 3. Save the user message
        await fetch(`${base}/api/conversations/${convId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                role: "user",
                content: goal,
                client_id: "browser-extension",
            }),
        });

        // 4. Save the assistant answer
        if (answer) {
            await fetch(`${base}/api/conversations/${convId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    role: "assistant",
                    content: answer,
                    client_id: "browser-extension",
                }),
            });
        }

        return convId;
    } catch (err) {
        console.warn("Failed to sync browser runtime to conversation:", err);
        return null;
    }
}

function stripSnapshotScreenshot(snapshot?: PageSnapshot | null): PageSnapshot | null | undefined {
    if (!snapshot) return snapshot;
    const { screenshot: _screenshot, ...rest } = snapshot;
    return rest;
}

function stripResultScreenshots(result: ActionExecutionResult): ActionExecutionResult {
    return {
        ...result,
        before: stripSnapshotScreenshot(result.before) as PageSnapshot,
        after: stripSnapshotScreenshot(result.after) as PageSnapshot,
    };
}

function isAutomationPrompt(prompt: string) {
    return /\b(open|navigate|browse|click|press|type|search|find|select|choose|book|ticket|tickets|seat|seats|showtime|showtimes|movie|movies|website|site|youtube|google|mute|unmute|play|pause|scroll|tab|video)\b/i.test(prompt);
}

async function postBrowserRuntimeStart(
    baseUrl: string,
    body: {
        goal: string;
        page: PageSnapshot;
        max_steps?: number;
        context?: Record<string, any>;
        conversation_id?: string;
        client_id?: string;
        persist?: boolean;
    }
): Promise<BrowserRuntimeStepResponse> {
    const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/api/browser/runtime/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Browser runtime start HTTP ${resp.status}: ${errText}`);
    }

    return await resp.json();
}

async function postBrowserRuntimeStep(
    baseUrl: string,
    body: {
        session_id: string;
        page: PageSnapshot;
        result?: ActionExecutionResult;
    }
): Promise<BrowserRuntimeStepResponse> {
    const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/api/browser/runtime/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Browser runtime step HTTP ${resp.status}: ${errText}`);
    }

    return await resp.json();
}

async function runBrowserRuntime(
    baseUrl: string,
    goal: string,
    onStreamEvent?: (event: AgentStreamEvent) => void | Promise<void>,
    conversationId?: string | null,
) {
    let sessionId = "";
    let step = 0;
    let finalMessage = "";

    await onStreamEvent?.({ event: "automation_started", data: { goal } });

    const initialPage = await capturePageSnapshot();
    let plan = await postBrowserRuntimeStart(baseUrl, {
        goal,
        page: initialPage,
        max_steps: 8,
        conversation_id: conversationId || undefined,
        client_id: "browser-extension",
        persist: true,
    });
    sessionId = plan.session_id;

    if (plan.conversation_id) {
        await onStreamEvent?.({
            event: "conversation",
            data: { conversation_id: plan.conversation_id, run_id: plan.run_id },
        });
    }

    await onStreamEvent?.({
        event: "browser_session_started",
        data: { session_id: sessionId, goal, conversation_id: plan.conversation_id, run_id: plan.run_id },
    });

    for (let i = 0; i < 12; i++) {
        step = plan.step;

        await onStreamEvent?.({
            event: "automation_plan",
            data: {
                ...plan,
                actions: plan.action ? [plan.action] : [],
            },
        });

        if (plan.done) {
            finalMessage = plan.message || "Done.";
            await onStreamEvent?.({ event: "answer_delta", data: { delta: finalMessage } });
            await onStreamEvent?.({
                event: "final",
                data: {
                    answer: finalMessage,
                    iterations: step,
                    satisfactory: plan.status === "completed",
                    mode: "automation",
                },
            });
            return { answer: finalMessage, stream_events: [] };
        }

        if (!plan.action) {
            finalMessage = plan.message || "I couldn't find a reliable next browser action.";
            await onStreamEvent?.({ event: "automation_blocked", data: plan });
            await onStreamEvent?.({
                event: "final",
                data: { answer: finalMessage, iterations: step, satisfactory: false, mode: "automation" },
            });
            return { answer: finalMessage, stream_events: [] };
        }

        await onStreamEvent?.({
            event: "automation_execute",
            data: { actions: [plan.action], expected_state: plan.expected_state },
        });

        const results = await executeAutomationActions([plan.action]);
        const fullResult = results[0];
        const leanResults = results.map(stripResultScreenshots);
        await onStreamEvent?.({ event: "automation_observation", data: { results: leanResults } });

        const failed = results.find((result) => !result.success);
        if (failed) {
            await onStreamEvent?.({ event: "automation_replan", data: { reason: failed.error || "browser action failed" } });
        }

        const currentPage = fullResult?.after || (await capturePageSnapshot());
        const latestResult = fullResult ? stripResultScreenshots(fullResult) : undefined;
        plan = await postBrowserRuntimeStep(baseUrl, {
            session_id: sessionId,
            page: currentPage,
            result: latestResult,
        });
    }

    finalMessage = "I stopped after too many browser runtime iterations to avoid looping.";
    await onStreamEvent?.({ event: "final", data: { answer: finalMessage, iterations: step, satisfactory: false, mode: "automation" } });
    return { answer: finalMessage, stream_events: [] };
}

export async function continueBrowserRuntimeSession(
    runtimePayload: any,
    onStreamEvent?: (event: AgentStreamEvent) => void | Promise<void>
) {
    const baseUrl = await getExtensionBaseUrl();
    let plan: BrowserRuntimeStepResponse | null =
        runtimePayload?.runtime_step || runtimePayload?.result?.runtime_step || runtimePayload || null;

    if (!plan || typeof plan !== "object" || !plan.session_id) {
        throw new Error("Missing browser runtime session payload.");
    }

    let finalMessage = "";
    let step = Number(plan.step || 0);

    await onStreamEvent?.({
        event: "browser_session_started",
        data: { session_id: plan.session_id },
    });

    for (let i = 0; i < 12; i++) {
        step = Number(plan.step || step || 0);

        await onStreamEvent?.({
            event: "automation_plan",
            data: {
                ...plan,
                actions: plan.action ? [plan.action] : [],
            },
        });

        if (plan.done) {
            finalMessage = plan.message || "Done.";
            await onStreamEvent?.({
                event: "final",
                data: {
                    answer: finalMessage,
                    iterations: step,
                    satisfactory: plan.status === "completed",
                    mode: "automation",
                },
            });
            return { answer: finalMessage };
        }

        if (!plan.action) {
            finalMessage = plan.message || "I couldn't find a reliable next browser action.";
            await onStreamEvent?.({ event: "automation_blocked", data: plan });
            await onStreamEvent?.({
                event: "final",
                data: { answer: finalMessage, iterations: step, satisfactory: false, mode: "automation" },
            });
            return { answer: finalMessage };
        }

        await onStreamEvent?.({
            event: "automation_execute",
            data: { actions: [plan.action], expected_state: plan.expected_state },
        });

        const results = await executeAutomationActions([plan.action]);
        const fullResult = results[0];
        const leanResults = results.map(stripResultScreenshots);
        await onStreamEvent?.({ event: "automation_observation", data: { results: leanResults } });

        const failed = results.find((result) => !result.success);
        if (failed) {
            await onStreamEvent?.({ event: "automation_replan", data: { reason: failed.error || "browser action failed" } });
        }

        const currentPage = fullResult?.after || (await capturePageSnapshot());
        const latestResult = fullResult ? stripResultScreenshots(fullResult) : undefined;
        plan = await postBrowserRuntimeStep(baseUrl, {
            session_id: plan.session_id,
            page: currentPage,
            result: latestResult,
        });
    }

    finalMessage = "I stopped after too many browser runtime iterations to avoid looping.";
    await onStreamEvent?.({ event: "final", data: { answer: finalMessage, iterations: step, satisfactory: false, mode: "automation" } });
    return { answer: finalMessage };
}

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

async function consumeSseStream(
    response: Response,
    onStreamEvent?: (event: AgentStreamEvent) => void | Promise<void>
): Promise<AgentStreamEvent[]> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("Streaming response body is not available.");
    }

    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    const events: AgentStreamEvent[] = [];

    const parseBlock = async (block: string) => {
        if (!block.trim()) return;

        let eventName = "message";
        const dataLines: string[] = [];

        for (const rawLine of block.split(/\r?\n/)) {
            const line = rawLine.trimEnd();
            if (!line || line.startsWith(":")) continue;
            if (line.startsWith("event:")) {
                eventName = line.slice(6).trim() || "message";
            } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trimStart());
            }
        }

        const dataRaw = dataLines.join("\n");
        if (!dataRaw) return;

        let data: any = dataRaw;
        try {
            data = JSON.parse(dataRaw);
        } catch (_err) {
            data = { raw: dataRaw };
        }

        const payload = { event: eventName, data };
        events.push(payload);
        if (onStreamEvent) {
            await onStreamEvent(payload);
        }
    };

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let separatorIndex = buffer.search(/\r?\n\r?\n/);
        while (separatorIndex !== -1) {
            const block = buffer.slice(0, separatorIndex);
            const separatorMatch = buffer.slice(separatorIndex).match(/^\r?\n\r?\n/);
            const separatorLength = separatorMatch ? separatorMatch[0].length : 2;
            buffer = buffer.slice(separatorIndex + separatorLength);

            await parseBlock(block);
            separatorIndex = buffer.search(/\r?\n\r?\n/);
        }
    }

    if (buffer.trim()) {
        await parseBlock(buffer);
    }

    return events;
}

export async function executeAgent(
    fullCommand: string,
    prompt: string,
    chatHistory: any[] = [],
    attachedFilePath?: string,
    onStreamEvent?: (event: AgentStreamEvent) => void | Promise<void>,
    conversationId?: string | null,
) {
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
    const storage = (await browser.storage.local.get([
        "baseUrl",
        "googleUser",
        "jportalId",
        "jportalPass",
        "jportalData"
    ])) as ExtensionStorage;
    const baseUrl = storage.baseUrl || import.meta.env.VITE_API_URL || "http://localhost:5454";
    let tabContext = "";
    let activeTabUrl = "";
    
    // Check for mentions in the prompt
    const mentionMatch = prompt.match(/@([^\s]+)/);
    let usedMention = false;

    if (mentionMatch) {
        try {
            const mentionedTitle = mentionMatch[1];
            const allTabs = await browser.tabs.query({});
            const matchedTab = allTabs.find(t => 
                (t.title && t.title.includes(mentionedTitle)) || 
                (t.url && t.url.includes(mentionedTitle))
            );
            
            if (matchedTab) {
                const title = matchedTab.title || "No Title";
                const url = matchedTab.url || "No URL";
                tabContext = `Tab: ${title} (URL: ${url})`;
                activeTabUrl = url;
                usedMention = true;
                console.log("Using mentioned tab context - Title:", title, "URL:", url);
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
                activeTabUrl = activeTab.url || "";
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

    if (endpoint === "/api/genai/react" && isAutomationPrompt(prompt)) {
        return await runBrowserRuntime(baseUrl, prompt, onStreamEvent, conversationId);
    }

    // Helper: capture the active tab's HTML for client-side context
    const capturePageHtml = async (): Promise<string> => {
        try {
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0 && tabs[0].id) {
                const results = await browser.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    func: () => document.documentElement.outerHTML,
                });
                if (results && results[0] && results[0].result) {
                    return results[0].result as string;
                }
            }
        } catch (e) {
            console.error("Failed to capture page HTML:", e);
        }
        return "";
    };

    let payload: any;
    let queryParams = "";
    if (endpoint === "/api/genai/react") {
        const clientHtml = await capturePageHtml();
        const urlContext = activeTabUrl ? `[Active Page: ${activeTabUrl}]` : "";
        payload = {
            question: `${urlContext} ${tabContext} ${prompt}`.trim(),
            chat_history: chatHistory || [],
            pyjiit_login_response: storage.jportalData || null,
            client_html: clientHtml || undefined,
            attached_file_path: attachedFilePath,
            conversation_id: conversationId || undefined,
            client_id: "browser-extension",
            client_context: {
                active_tab_url: activeTabUrl || undefined,
                tab_context: tabContext || undefined,
            },
        };
    }
    else if (endpoint === "/api/pyjiit/semesters" || endpoint === "/api/pyjiit/attendence") {
        const j = storage.jportalData;
        if (!j) throw new Error("Portal data missing");

        payload = j;
    }
    else if (endpoint === "/api/genai/youtube" || endpoint === "/api/genai/website" || endpoint === "/api/genai/github") {
        const clientHtml = await capturePageHtml();
        let resolvedUrl = explicitUrl || activeTabUrl;

        // Normalise GitHub URLs: strip paths like /commits/, /tree/, /issues/ etc.
        if (endpoint === "/api/genai/github" && resolvedUrl) {
            try {
                const ghUrl = new URL(resolvedUrl);
                if (ghUrl.hostname === "github.com") {
                    const segments = ghUrl.pathname.split("/").filter(Boolean);
                    const nonRepoSegments = new Set([
                        "commits", "commit", "issues", "pulls", "pull",
                        "actions", "projects", "wiki", "settings", "releases",
                        "tags", "branches", "compare", "network", "graphs",
                        "security", "pulse", "community", "discussions",
                        "tree", "blob", "raw", "blame", "edit",
                    ]);
                    if (segments.length > 2 && nonRepoSegments.has(segments[2])) {
                        resolvedUrl = `${ghUrl.origin}/${segments[0]}/${segments[1]}`;
                    }
                }
            } catch (_) { /* leave resolvedUrl unchanged if URL parsing fails */ }
        }

        payload = {
            url: resolvedUrl,
            question: userQuestion || prompt,
            chat_history: chatHistory || [],
            client_html: clientHtml || undefined,
            attached_file_path: attachedFilePath,
        };
        if (resolvedUrl) {
            queryParams = `?url=${encodeURIComponent(resolvedUrl)}`;
        }
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
    else if (endpoint === "/api/upload") {
        // File upload is handled separately via FormData in the component
        // This path is for when the slash command is used without a file
        throw new Error("Use the attachment button (📎) to upload files.");
    }
    else if (endpoint === "/api/pyjiit/login") {
        if (!storage.jportalId || !storage.jportalPass) {
            throw new Error("JIIT Portal credentials not configured. Set them in Settings.");
        }
        payload = {
            username: storage.jportalId,
            password: storage.jportalPass,
        };
    }
    else if (endpoint === "/api/pyjiit/attendence") {
        const j = storage.jportalData;
        if (!j) throw new Error("Portal data missing. Login to JIIT Portal first.");
        payload = {
            session_payload: j,
            registration_code: prompt.trim() || null,
        };
    }
    else if (endpoint === "/api/skills/execute") {
        // The user types: /skill-run <skill_name> <query...>
        // 'prompt' contains everything after '/skill-run '
        const firstSpace = prompt.indexOf(" ");
        const skillName = firstSpace === -1 ? prompt : prompt.slice(0, firstSpace);
        const query = firstSpace === -1 ? "" : prompt.slice(firstSpace + 1).trim();
        
        const clientHtml = await capturePageHtml();

        payload = {
            skill_name: skillName,
            prompt: query,
            chat_history: chatHistory || [],
            pyjiit_login_response: storage.jportalData || null,
            client_html: clientHtml || undefined,
            attached_file_path: attachedFilePath,
            conversation_id: conversationId || undefined,
            client_id: "browser-extension",
            client_context: {
                active_tab_url: activeTabUrl || undefined,
                tab_context: tabContext || undefined,
            },
        };
    }
    else {
        payload = {
            url: `${prompt}`,
            question: `${prompt}`,
            chat_history: chatHistory || [],
            query: `${prompt}`,
            max_results: 5,
            to: "",
            subject: "",
            body: "",
            summary: "",
            start_time: "",
            end_time: "",
            description: "",
            portalData: storage.jportalData || null,
            attached_file_path: attachedFilePath,
        };
    }
    // now if condition that if 3 enpoints are of get request then use get else post

    const requestUrl = finalUrl + queryParams;
    const isStreamingEndpoint =
        endpoint === "/api/genai/react" || endpoint === "/api/skills/execute";
    const streamRequestUrl = isStreamingEndpoint
        ? requestUrl.replace(/\/$/, "") + "/stream"
        : requestUrl;

    if (endpoint === "/api/genai/health/" || endpoint === "/") {
        const resp = await fetch(requestUrl, {
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

    const resp = await fetch(streamRequestUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(isStreamingEndpoint ? { Accept: "text/event-stream" } : {}),
        },
        body: JSON.stringify(payload),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errText}`);
    }
    if (isStreamingEndpoint) {
        const streamEvents = await consumeSseStream(resp, onStreamEvent);
        let streamedAnswer = "";
        let finalAnswer = "";

        for (const evt of streamEvents) {
            if (evt.event === "answer_delta" && typeof evt.data?.delta === "string") {
                streamedAnswer += evt.data.delta;
            }
            if (evt.event === "final" && typeof evt.data?.answer === "string") {
                finalAnswer = evt.data.answer;
            }
        }

        return {
            answer: finalAnswer || streamedAnswer,
            stream_events: streamEvents,
        };
    }

    const data = await resp.json();
    return data;
}
