export async function executeBrowserActions(actions: any[]) {
    // actions is a list of action objects
    // Example: [{ "type": "OPEN_TAB", "url": "..." }, { "type": "CLICK", "element": "..."}]

    for (const action of actions) {
        console.log("Executing action:", action);

        try {
            switch (action.type) {
                case "OPEN_TAB": {
                    const url = action.url;
                    if (url) {
                        await browser.tabs.create({ url });
                    }
                    break;
                }
                case "SWITCH_TAB": {
                    // Logic to find and switch tab
                    // For now, simpler implementation: just log
                    console.log("SWITCH_TAB not fully implemented", action);
                    break;
                }
                case "CLICK": {
                    // Requires content script interaction
                    // We need to send a message to the active tab
                    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
                    if (tabs.length > 0 && tabs[0].id) {
                        await browser.tabs.sendMessage(tabs[0].id, {
                            type: "EXECUTE_ACTION",
                            action: action
                        });
                    }
                    break;
                }
                case "TYPE": {
                    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
                    if (tabs.length > 0 && tabs[0].id) {
                        await browser.tabs.sendMessage(tabs[0].id, {
                            type: "EXECUTE_ACTION",
                            action: action
                        });
                    }
                    break;
                }
                default:
                    console.warn("Unknown action type:", action.type);
            }
            
            // Artificial delay between actions
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (err) {
            console.error("Failed to execute action:", action, err);
        }
    }
}
