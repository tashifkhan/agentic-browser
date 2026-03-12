type BrowserAction = Record<string, any> & { type?: string };

function normalizeAction(action: BrowserAction): BrowserAction {
    const normalized = { ...action };

    if (typeof normalized.type === "string") {
        normalized.type = normalized.type.toUpperCase();
    }

    // Alias support for model variations
    if (normalized.element && !normalized.selector) {
        normalized.selector = normalized.element;
    }
    if (normalized.text && !normalized.value) {
        normalized.value = normalized.text;
    }

    return normalized;
}

export async function executeBrowserActions(actions: BrowserAction[]) {
    if (!Array.isArray(actions) || actions.length === 0) {
        return;
    }

    for (const rawAction of actions) {
        const action = normalizeAction(rawAction);
        console.log("Executing action:", action);

        try {
            const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });

            const result = await browser.runtime.sendMessage({
                type: "EXECUTE_ACTION",
                payload: {
                    action,
                    tabId: activeTab?.id,
                },
            });

            if (!result?.success) {
                console.error("Action failed:", action, result?.error || result);
            }

            // Short delay between actions so page state can settle.
            await new Promise((resolve) => setTimeout(resolve, 350));
        } catch (err) {
            console.error("Failed to execute action:", action, err);
        }
    }
}
