export type ElementSnapshot = {
    selector?: string;
    tag?: string;
    role?: string | null;
    text?: string;
    aria_label?: string | null;
    placeholder?: string | null;
    id?: string;
    name?: string | null;
    href?: string | null;
    input_type?: string | null;
    value?: string | null;
    clickable?: boolean;
    visible?: boolean;
};

export type PageSnapshot = {
    url: string;
    title: string;
    visible_text: string;
    active_element?: ElementSnapshot | null;
    interactive: ElementSnapshot[];
    screenshot?: string | null;
    media?: {
        has_video: boolean;
        paused?: boolean;
        muted?: boolean;
        volume?: number;
        current_time?: number;
        duration?: number;
    } | null;
};

export type BrowserAction = Record<string, any> & {
    type: string;
    selector?: string;
    text?: string;
    role?: string;
    value?: string;
    url?: string;
    active?: boolean;
    key?: string;
    command?: string;
    direction?: string;
    amount?: number;
    ms?: number;
    description?: string;
};

export type ActionExecutionResult = {
    action: BrowserAction;
    success: boolean;
    error?: string;
    before: PageSnapshot;
    after: PageSnapshot;
    verification?: {
        passed: boolean;
        expected: string;
        actual: any;
    };
};

function normalizeAction(action: BrowserAction): BrowserAction {
    const normalized = { ...action };

    if (typeof normalized.type === "string") {
        normalized.type = normalized.type.toUpperCase();
    }
    if (normalized.element && !normalized.selector) {
        normalized.selector = normalized.element;
    }
    if (normalized.text && !normalized.value && normalized.type === "TYPE") {
        normalized.value = normalized.text;
    }
    if (normalized.time && !normalized.ms) {
        normalized.ms = normalized.time;
    }

    return normalized;
}

async function getActiveTab() {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
        throw new Error("No active tab found");
    }
    return activeTab;
}

function waitForTabComplete(tabId: number, timeoutMs = 10000) {
    return new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            browser.tabs.onUpdated.removeListener(listener);
            resolve();
        };
        const listener = (updatedTabId: number, changeInfo: any) => {
            if (updatedTabId === tabId && changeInfo.status === "complete") {
                finish();
            }
        };
        browser.tabs.onUpdated.addListener(listener);
        setTimeout(finish, timeoutMs);
    });
}

async function downscaleScreenshot(dataUrl: string, maxWidth = 1280, quality = 0.55): Promise<string> {
    return await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            const scale = Math.min(1, maxWidth / image.width);
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                resolve(dataUrl);
                return;
            }
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", quality));
        };
        image.onerror = () => resolve(dataUrl);
        image.src = dataUrl;
    });
}

async function captureVisibleScreenshot(windowId?: number): Promise<string | null> {
    try {
        const raw = typeof windowId === "number"
            ? await browser.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 55 })
            : await browser.tabs.captureVisibleTab({ format: "jpeg", quality: 55 });
        return await downscaleScreenshot(raw);
    } catch (error) {
        console.warn("Failed to capture visible tab screenshot:", error);
        return null;
    }
}

export async function capturePageSnapshot(): Promise<PageSnapshot> {
    try {
        const activeTab = await getActiveTab();
        if (!activeTab.id || activeTab.url?.startsWith("chrome://")) {
            return {
                url: activeTab.url || "",
                title: activeTab.title || "",
                visible_text: "",
                interactive: [],
                media: { has_video: false },
            };
        }

        const [result] = await browser.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: () => {
                const cssEscape = (value: string) => {
                    const css = (globalThis as any).CSS;
                    return css?.escape ? css.escape(value) : value.replace(/"/g, '\\"');
                };
                const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
                const isVisible = (el: Element) => {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
                };
                const isClickable = (el: Element) => {
                    const html = el as HTMLElement;
                    const tag = el.tagName.toLowerCase();
                    const role = el.getAttribute("role");
                    const style = window.getComputedStyle(el);
                    return (
                        ["a", "button", "input", "select", "textarea", "summary", "label"].includes(tag) ||
                        !!role ||
                        html.isContentEditable ||
                        el.hasAttribute("onclick") ||
                        el.hasAttribute("tabindex") ||
                        style.cursor === "pointer"
                    );
                };
                const unique = (selector: string) => {
                    try {
                        return document.querySelectorAll(selector).length === 1;
                    } catch (_) {
                        return false;
                    }
                };
                const selectorFor = (el: Element) => {
                    const html = el as HTMLElement;
                    if (html.id && unique(`#${cssEscape(html.id)}`)) return `#${cssEscape(html.id)}`;
                    for (const attr of ["data-testid", "data-test", "data-cy", "aria-label", "name", "placeholder"]) {
                        const value = el.getAttribute(attr);
                        if (!value) continue;
                        const selector = `${el.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
                        if (unique(selector)) return selector;
                    }
                    const aria = el.getAttribute("aria-label");
                    if (aria) return `${el.tagName.toLowerCase()}[aria-label="${cssEscape(aria)}"]`;
                    const name = el.getAttribute("name");
                    if (name) return `${el.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
                    const role = el.getAttribute("role");
                    if (role) return `${el.tagName.toLowerCase()}[role="${cssEscape(role)}"]`;
                    const path: string[] = [];
                    let current: Element | null = el;
                    while (current && current !== document.body && path.length < 5) {
                        const currentTag = current.tagName;
                        const tag = currentTag.toLowerCase();
                        const parent: Element | null = current.parentElement;
                        if (!parent) break;
                        const siblings = Array.from(parent.children).filter((child) => child.tagName === currentTag);
                        const index = siblings.indexOf(current) + 1;
                        path.unshift(`${tag}:nth-of-type(${index})`);
                        const selector = path.join(" > ");
                        if (unique(selector)) return selector;
                        current = parent;
                    }
                    return path.length ? path.join(" > ") : el.tagName.toLowerCase();
                };
                const snapshotElement = (el: Element | null) => {
                    if (!el) return null;
                    const html = el as HTMLElement;
                    const input = el as HTMLInputElement;
                    const text = normalize(html.innerText || el.textContent || input.value || el.getAttribute("aria-label") || el.getAttribute("placeholder"));
                    return {
                        selector: selectorFor(el),
                        tag: el.tagName.toLowerCase(),
                        role: el.getAttribute("role"),
                        text: text.slice(0, 160),
                        aria_label: el.getAttribute("aria-label"),
                        placeholder: el.getAttribute("placeholder"),
                        id: html.id || "",
                        name: el.getAttribute("name"),
                        href: el.getAttribute("href"),
                        input_type: input.type || null,
                        value: input.value || null,
                        clickable: isClickable(el),
                        visible: isVisible(el),
                    };
                };

                const directCandidates = Array.from(
                    document.querySelectorAll('a, button, input, textarea, select, video, summary, label, [role], [tabindex], [onclick], [contenteditable="true"]')
                );
                const pointerCandidates = Array.from(document.body?.querySelectorAll("*") || []).filter((el) => {
                    if (!isVisible(el)) return false;
                    if (!isClickable(el)) return false;
                    const label = normalize((el as HTMLElement).innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder"));
                    return label.length > 0 && label.length <= 240;
                });
                const interactive = Array.from(new Set([...directCandidates, ...pointerCandidates]))
                    .filter((el) => isVisible(el) && isClickable(el))
                    .slice(0, 80)
                    .map(snapshotElement)
                    .filter(Boolean);
                const video = document.querySelector("video") as HTMLVideoElement | null;
                return {
                    url: window.location.href,
                    title: document.title,
                    visible_text: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 5000),
                    active_element: snapshotElement(document.activeElement),
                    interactive,
                    media: video
                        ? {
                              has_video: true,
                              paused: video.paused,
                              muted: video.muted,
                              volume: video.volume,
                              current_time: video.currentTime,
                              duration: Number.isFinite(video.duration) ? video.duration : undefined,
                          }
                        : { has_video: false },
                };
            },
        });

        const snapshot = result?.result as PageSnapshot;
        snapshot.screenshot = await captureVisibleScreenshot(activeTab.windowId);
        return snapshot;
    } catch (error) {
        console.error("Failed to capture page snapshot:", error);
        return { url: "", title: "", visible_text: "", interactive: [], media: { has_video: false } };
    }
}

async function runPageAction(tabId: number, action: BrowserAction) {
    const [result] = await browser.scripting.executeScript({
        target: { tabId },
        func: (rawAction: BrowserAction) => {
            const action = rawAction;
            const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
            const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim().toLowerCase();
            const visible = (el: Element) => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
            };
            const isClickable = (el: Element) => {
                const html = el as HTMLElement;
                const tag = el.tagName.toLowerCase();
                const role = el.getAttribute("role");
                const style = window.getComputedStyle(el);
                return (
                    ["a", "button", "input", "select", "textarea", "summary", "label"].includes(tag) ||
                    !!role ||
                    html.isContentEditable ||
                    el.hasAttribute("onclick") ||
                    el.hasAttribute("tabindex") ||
                    style.cursor === "pointer"
                );
            };
            const clickableTarget = (el: Element) => {
                let current: Element | null = el;
                while (current && current !== document.body) {
                    if (isClickable(current)) return current as HTMLElement;
                    current = current.parentElement;
                }
                return el as HTMLElement;
            };
            const elementLabel = (el: Element) => {
                const input = el as HTMLInputElement;
                return normalize(input.value || (el as HTMLElement).innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder"));
            };
            const isEditable = (el: Element) => {
                const tag = el.tagName.toLowerCase();
                return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
            };
            const byText = (text: string, role?: string) => {
                const target = normalize(text);
                const targetTerms = target.split(/\W+/).filter((term) => term.length > 2);
                const candidates = Array.from(document.querySelectorAll(role ? `[role="${role}"], ${role}` : "*"))
                    .filter((el) => visible(el))
                    .map((el) => {
                        const label = elementLabel(el);
                        if (!label || label.length > 300) return null;
                        const termScore = targetTerms.reduce((sum, term) => sum + (label.includes(term) ? 1 : 0), 0);
                        const score =
                            (label === target ? 100 : 0) +
                            (label.includes(target) ? 60 : 0) +
                            (target.includes(label) && label.length > 2 ? 20 : 0) +
                            termScore * 5 +
                            (isClickable(el) ? 10 : 0) -
                            Math.min(label.length / 40, 8);
                        return { el: clickableTarget(el), score };
                    })
                    .filter((item): item is { el: HTMLElement; score: number } => !!item && item.score > 0)
                    .sort((a, b) => b.score - a.score);
                return candidates[0]?.el;
            };
            const resolve = (selector?: string, text?: string, role?: string) => {
                if (selector) {
                    try {
                        const matches = Array.from(document.querySelectorAll(selector)).filter(visible) as HTMLElement[];
                        if (matches.length && text) {
                            const terms = text.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
                            const scored = matches
                                .map((el) => {
                                    const label = (el.innerText || el.textContent || el.getAttribute("aria-label") || "").toLowerCase();
                                    const score = terms.reduce((sum, term) => sum + (label.includes(term) ? 1 : 0), 0);
                                    return { el, score };
                                })
                                .sort((a, b) => b.score - a.score);
                            if (scored[0]?.score > 0) return scored[0].el;
                        }
                        if (matches[0]) return matches[0];
                    } catch (_) {
                        // fall through to text lookup
                    }
                }
                if (text) return byText(text, role) || null;
                return null;
            };
            const resolveEditable = (selector?: string, text?: string, role?: string) => {
                if (selector) {
                    try {
                        const matches = Array.from(document.querySelectorAll(selector)).filter((el) => visible(el) && isEditable(el)) as HTMLElement[];
                        if (matches[0]) return matches[0];
                    } catch (_) {
                        // fall through to editable text lookup
                    }
                }
                const target = normalize(text || "");
                const inputs = Array.from(document.querySelectorAll("input, textarea, [contenteditable='true']")).filter((el) => visible(el)) as HTMLElement[];
                if (!target) return inputs[0] || null;
                return (
                    inputs
                        .map((el) => {
                            const label = elementLabel(el);
                            const score = (label === target ? 100 : 0) + (label.includes(target) ? 60 : 0) + (target.includes(label) && label.length > 2 ? 20 : 0);
                            return { el, score };
                        })
                        .sort((a, b) => b.score - a.score)[0]?.el ||
                    inputs[0] ||
                    byText(text || "", role) ||
                    null
                );
            };
            const pointerClick = (el: HTMLElement) => {
                el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior });
                const rect = el.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                for (const type of ["pointerover", "mouseover", "pointermove", "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
                    const event = type.startsWith("pointer")
                        ? new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", isPrimary: true })
                        : new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
                    el.dispatchEvent(event);
                }
                el.click();
            };
            const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
                const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
                descriptor?.set?.call(el, value);
                el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
            };

            return (async () => {
                switch (action.type) {
                    case "CLICK": {
                        const el = resolve(action.selector, action.text, action.role);
                        if (!el) throw new Error(`Element not found: ${action.selector || action.text || action.role}`);
                        pointerClick(el);
                        return { message: "clicked" };
                    }
                    case "HOVER": {
                        const el = resolve(action.selector, action.text, action.role);
                        if (!el) throw new Error(`Element not found: ${action.selector || action.text || action.role}`);
                        el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior });
                        const rect = el.getBoundingClientRect();
                        el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
                        el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
                        return { message: "hovered" };
                    }
                    case "TYPE": {
                        const el = resolveEditable(action.selector, action.text, action.role) as HTMLElement | null;
                        if (!el) throw new Error(`Element not found: ${action.selector || action.text || action.role}`);
                        el.focus();
                        if (el.isContentEditable) {
                            el.textContent = action.value || "";
                            el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: action.value || "" }));
                        } else {
                            setNativeValue(el as HTMLInputElement | HTMLTextAreaElement, action.value || "");
                        }
                        return { message: "typed" };
                    }
                    case "KEY_PRESS": {
                        const target = (document.activeElement || document.body) as HTMLElement;
                        const key = action.key || "Enter";
                        target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
                        target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
                        return { message: `pressed ${key}` };
                    }
                    case "SCROLL": {
                        const amount = action.amount || 600;
                        const direction = action.direction || "down";
                        if (direction === "up") window.scrollBy(0, -amount);
                        else if (direction === "top") window.scrollTo(0, 0);
                        else if (direction === "bottom") window.scrollTo(0, document.body.scrollHeight);
                        else window.scrollBy(0, amount);
                        return { message: `scrolled ${direction}` };
                    }
                    case "WAIT": {
                        await sleep(action.ms || 1000);
                        return { message: "waited" };
                    }
                    case "MEDIA_CONTROL": {
                        const video = document.querySelector("video") as HTMLVideoElement | null;
                        if (!video) throw new Error("No video element found");
                        const command = action.command || "";
                        if (command === "mute") video.muted = true;
                        else if (command === "unmute") video.muted = false;
                        else if (command === "play") await video.play();
                        else if (command === "pause") video.pause();
                        else throw new Error(`Unsupported media command: ${command}`);
                        video.dispatchEvent(new Event("volumechange", { bubbles: true }));
                        return { message: `media ${command}`, muted: video.muted, paused: video.paused, volume: video.volume };
                    }
                    default:
                        throw new Error(`Unsupported page action: ${action.type}`);
                }
            })();
        },
        args: [action],
    });
    return result?.result;
}

function verify(action: BrowserAction, after: PageSnapshot) {
    if (action.type === "MEDIA_CONTROL" && action.command === "mute") {
        return { passed: after.media?.muted === true, expected: "video.muted === true", actual: after.media?.muted };
    }
    if (action.type === "MEDIA_CONTROL" && action.command === "unmute") {
        return { passed: after.media?.muted === false, expected: "video.muted === false", actual: after.media?.muted };
    }
    if ((action.type === "NAVIGATE" || action.type === "OPEN_TAB") && action.url) {
        return { passed: after.url.startsWith(action.url) || after.url.includes(new URL(action.url).hostname), expected: `url includes ${action.url}`, actual: after.url };
    }
    return undefined;
}

export async function executeAutomationActions(actions: BrowserAction[]): Promise<ActionExecutionResult[]> {
    const results: ActionExecutionResult[] = [];

    for (const rawAction of actions) {
        const action = normalizeAction(rawAction);
        const before = await capturePageSnapshot();
        let success = false;
        let error: string | undefined;

        try {
            const activeTab = await getActiveTab();
            const tabId = activeTab.id as number;
            if (action.type === "NAVIGATE") {
                if (!action.url) throw new Error("NAVIGATE requires url");
                await browser.tabs.update(tabId, { url: action.url });
                await waitForTabComplete(tabId);
            } else if (action.type === "OPEN_TAB") {
                if (!action.url) throw new Error("OPEN_TAB requires url");
                const tab = await browser.tabs.create({ url: action.url, active: action.active !== false });
                if (tab.id && action.active !== false) await waitForTabComplete(tab.id);
            } else {
                await runPageAction(tabId, action);
                await new Promise((resolve) => setTimeout(resolve, action.type === "MEDIA_CONTROL" ? 150 : 350));
            }
            success = true;
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
        }

        const after = await capturePageSnapshot();
        const verification = verify(action, after);
        if (verification && !verification.passed) {
            success = false;
            error = error || `Verification failed: ${verification.expected}`;
        }

        results.push({ action, success, error, before, after, verification });
        if (!success) break;
    }

    return results;
}

export async function executeBrowserActions(actions: BrowserAction[]) {
    await executeAutomationActions(actions);
}
