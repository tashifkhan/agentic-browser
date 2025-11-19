// --- START: Interfaces for Tab Tracking (from your Plasmo project) ---
interface TabInfo {
  id?: number;
  url?: string;
  title?: string;
  favIconUrl?: string;
}

interface TabsData {
  allTabs: TabInfo[];
  activeTab: TabInfo;
  totalTabs: number;
  lastUpdated: string;
}
// --- END: Interfaces for Tab Tracking ---

export default defineBackground(() => {
  console.log("Background service worker started");

  // Track which tabs have the AI frame active
  const activeFrameTabs = new Set<number>();

  // --- START: Logic from WXT AI Assistant (Your Friend's Code) ---
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("\n🔔 Background received message:");
    console.log("Message type:", message.type);
    console.log("Message:", JSON.stringify(message, null, 2));
    console.log("Sender:", sender);

    // ============= AGENT TOOL EXECUTION - PRIORITY CHECK =============
    if (message.type === "EXECUTE_AGENT_TOOL") {
      console.log("\n🎬 ✅ EXECUTE_AGENT_TOOL MATCHED!");
      console.log("Payload:", JSON.stringify(message.payload, null, 2));

      handleExecuteAgentTool(message.payload)
        .then((result) => {
          console.log(
            "✅ handleExecuteAgentTool completed, sending response:",
            result
          );
          sendResponse(result);
        })
        .catch((err) => {
          console.error("❌ EXECUTE_AGENT_TOOL error:", err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }
    // ============= END AGENT TOOL EXECUTION =============

    if (message.type === "ACTIVATE_AI_FRAME") {
      handleActivateAIFrame(message.tabId)
        .then(sendResponse)
        .catch((err) => {
          console.error("ACTIVATE_AI_FRAME error:", err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    if (message.type === "DEACTIVATE_AI_FRAME") {
      handleDeactivateAIFrame(message.tabId)
        .then(sendResponse)
        .catch((err) => {
          console.error("DEACTIVATE_AI_FRAME error:", err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    if (message.type === "GET_ACTIVE_TAB") {
      handleGetActiveTab()
        .then(sendResponse)
        .catch((err) => {
          console.error("GET_ACTIVE_TAB error:", err);
          sendResponse({ success: false, error: err.message });
        });
      return true; // Keep channel open for async response
    }

    if (message.type === "GET_ALL_TABS") {
      handleGetAllTabs()
        .then(sendResponse)
        .catch((err) => {
          console.error("GET_ALL_TABS error:", err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    if (message.type === "EXECUTE_ACTION") {
      handleExecuteAction(message.payload)
        .then(sendResponse)
        .catch((err) => {
          console.error("EXECUTE_ACTION error:", err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    if (message.type === "GEMINI_REQUEST") {
      handleGeminiRequest(message.payload)
        .then(sendResponse)
        .catch((err) => {
          console.error("GEMINI_REQUEST error:", err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    if (message.type === "RUN_GENERATED_AGENT") {
      handleRunGeneratedAgent(message.payload)
        .then(sendResponse)
        .catch((err) => {
          console.error("RUN_GENERATED_AGENT error:", err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    // If no handler matched, send error response
    console.warn("❌ Unknown message type:", message.type);
    console.warn(
      "Available types: ACTIVATE_AI_FRAME, DEACTIVATE_AI_FRAME, GET_ACTIVE_TAB, GET_ALL_TABS, EXECUTE_ACTION, GEMINI_REQUEST, RUN_GENERATED_AGENT, EXECUTE_AGENT_TOOL"
    );
    sendResponse({ success: false, error: "Unknown message type" });
    return false;
  });
  // --- END: Logic from WXT AI Assistant ---

  // --- START: Tab Tracking Logic (from your Plasmo Project) ---
  // These listeners update the storage for the new Popup
  console.log("Tab tracking for popup is now active");

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
      storeTabsInfo();
    }
  });

  browser.tabs.onActivated.addListener(() => {
    storeTabsInfo();
  });

  browser.tabs.onCreated.addListener(() => {
    storeTabsInfo();
  });

  browser.tabs.onRemoved.addListener(() => {
    storeTabsInfo();
  });

  // Initial store on load
  storeTabsInfo();
  // --- END: Tab Tracking Logic ---
});

// =================================================================
// HELPER FUNCTIONS
// =================================================================

// --- START: Helpers from WXT AI Assistant ---

// async function handleActivateAIFrame(tabId?: number) {
//   try {
//     if (!tabId) {
//       const [tab] = await browser.tabs.query({
//         active: true,
//         currentWindow: true,
//       });
//       tabId = tab.id;
//     }

//     if (!tabId) {
//       return { success: false, error: "No tab ID found" };
//     }

//     console.log("Activating AI frame on tab:", tabId);

//     // Inject the AI frame directly with enhanced glow effects
//     await browser.scripting.executeScript({
//       target: { tabId },
//       func: () => {
//         const existingFrame = document.getElementById(
//           "ai-extension-frame-overlay"
//         );
//         const existingGlow = document.getElementById(
//           "ai-extension-glow-overlay"
//         );
//         const oldFrame = document.getElementById("ai-extension-frame");
//         const oldStyles = document.querySelectorAll(
//           "#ai-extension-animations, #ai-frame-styles"
//         );

//         if (existingFrame) existingFrame.remove();
//         if (existingGlow) existingGlow.remove();
//         if (oldFrame) oldFrame.remove();
//         oldStyles.forEach((style) => style.remove());

//         // Create glowing background overlay
//         const glowOverlay = document.createElement("div");
//         glowOverlay.id = "ai-extension-glow-overlay";
//         glowOverlay.style.cssText = `
//           position: fixed !important;
//           top: 0 !important;
//           left: 0 !important;
//           right: 0 !important;
//           bottom: 0 !important;
//           width: 100vw !important;
//           height: 100vh !important;
//           pointer-events: none !important;
//           z-index: 2147483646 !important;
//           background: radial-gradient(circle at center, rgba(128, 128, 128, 0.12) 0%, rgba(128, 128, 128, 0.04) 50%, transparent 100%) !important;
//           animation: ai-glow-pulse-animation 4s cubic-bezier(0.4, 0, 0.2, 1) infinite !important;
//           transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1) !important;
//         `;

//         const frame = document.createElement("div");
//         frame.id = "ai-extension-frame-overlay";
//         frame.style.cssText = `
//           position: fixed !important;
//           top: 0 !important;
//           left: 0 !important;
//           right: 0 !important;
//           bottom: 0 !important;
//           width: 100vw !important;
//           height: 100vh !important;
//           pointer-events: none !important;
//           z-index: 2147483647 !important;
//           border: 6px solid rgba(128, 128, 128, 0.7) !important;
//           border-radius: 4px !important;
//           box-shadow: inset 0 0 100px rgba(128, 128, 128, 0.3),
//                       inset 0 0 50px rgba(128, 128, 128, 0.4),
//                       0 0 80px rgba(128, 128, 128, 0.5),
//                       0 0 40px rgba(128, 128, 128, 0.6) !important;
//           animation: ai-frame-pulse-animation 3.5s cubic-bezier(0.4, 0, 0.2, 1) infinite !important;
//           transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1) !important;
//         `;
//         const centerIndicator = document.createElement("div");
//         centerIndicator.id = "ai-center-indicator";
//         centerIndicator.style.cssText = `
//           position: absolute !important;
//           top: 24px !important;
//           left: 50% !important;
//           transform: translateX(-50%) !important;
//           padding: 10px 20px !important;
//           background: linear-gradient(135deg, rgba(128, 128, 128, 0.95) 0%, rgba(128, 128, 128, 0.85) 100%) !important;
//           color: white !important;
//           font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
//           font-size: 13px !important;
//           font-weight: 600 !important;
//           border-radius: 24px !important;
//           box-shadow: 0 0 25px rgba(128, 128, 128, 0.7),
//                       inset 0 0 15px rgba(255, 255, 255, 0.25),
//                       0 4px 12px rgba(0, 0, 0, 0.15) !important;
//           animation: ai-indicator-pulse-animation 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite !important;
//           letter-spacing: 1.2px !important;
//           backdrop-filter: blur(8px) !important;
//           transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
//           pointer-events: none !important;
//           z-index: 1 !important;
//         `;
//         centerIndicator.textContent = "🤖 AI AGENT ACTIVE";
//         frame.appendChild(centerIndicator);

//         const scanLine = document.createElement("div");
//         scanLine.id = "ai-scan-line";
//         scanLine.style.cssText = `
//           position: absolute !important;
//           top: 0 !important;
//           left: 0 !important;
//           width: 100% !important;
//           height: 3px !important;
//           background: linear-gradient(90deg, 
//             transparent 0%, 
//             transparent 20%,
//             rgba(128, 128, 128, 0.6) 50%, 
//             transparent 80%,
//             transparent 100%) !important;
//           box-shadow: 0 0 15px rgba(128, 128, 128, 0.7),
//                       0 0 30px rgba(128, 128, 128, 0.4) !important;
//           animation: ai-scan-animation 4s cubic-bezier(0.4, 0, 0.2, 1) infinite !important;
//           opacity: 0 !important;
//           pointer-events: none !important;
//         `;
//         frame.appendChild(scanLine);

//         const styleId = "ai-frame-styles";
//         if (!document.getElementById(styleId)) {
//           const style = document.createElement("style");
//           style.id = styleId;
//           style.textContent = `
//             @keyframes ai-frame-pulse-animation {
//               0%, 100% {
//                 border-color: rgba(128, 128, 128, 0.6);
//                 box-shadow: inset 0 0 100px rgba(128, 128, 128, 0.25),
//                             inset 0 0 50px rgba(128, 128, 128, 0.35),
//                             0 0 80px rgba(128, 128, 128, 0.4),
//                             0 0 40px rgba(128, 128, 128, 0.5);
//               }
//               50% {
//                 border-color: rgba(128, 128, 128, 0.9);
//                 box-shadow: inset 0 0 140px rgba(128, 128, 128, 0.4),
//                             inset 0 0 70px rgba(128, 128, 128, 0.5),
//                             0 0 120px rgba(128, 128, 128, 0.6),
//                             0 0 60px rgba(128, 128, 128, 0.7);
//               }
//             }

//             @keyframes ai-glow-pulse-animation {
//               0%, 100% {
//                 opacity: 0.5;
//                 transform: scale(1);
//               }
//               50% {
//                 opacity: 0.8;
//                 transform: scale(1.01);
//               }
//             }

//             @keyframes ai-indicator-pulse-animation {
//               0%, 100% {
//                 transform: translateX(-50%) scale(1);
//                 opacity: 0.95;
//                 box-shadow: 0 0 25px rgba(128, 128, 128, 0.7),
//                             inset 0 0 15px rgba(255, 255, 255, 0.25);
//               }
//               50% {
//                 transform: translateX(-50%) scale(1.03);
//                 opacity: 1;
//                 box-shadow: 0 0 35px rgba(128, 128, 128, 0.9),
//                             inset 0 0 20px rgba(255, 255, 255, 0.4);
//               }
//             }

//             @keyframes ai-scan-animation {
//               0% {
//                 top: 0;
//                 opacity: 0;
//               }
//               10% {
//                 opacity: 1;
//               }
//               90% {
//                 opacity: 1;
//               }
//               100% {
//                 top: 100%;
//                 opacity: 0;
//               }
//             }
//           `;
//           document.head.appendChild(style);
//         }

//         document.body.appendChild(glowOverlay);
//         document.body.appendChild(frame);
//         console.log("✅ AI frame with glow overlay activated");
//       },
//     });

//     return { success: true, tabId };
//   } catch (error) {
//     console.error("Error activating AI frame:", error);
//     return { success: false, error: (error as Error).message };
//   }
// }

async function handleDeactivateAIFrame(tabId?: number) {
  try {
    if (!tabId) {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      tabId = tab.id;
    }

    if (!tabId) {
      return { success: false, error: "No tab ID found" };
    }

    console.log("Deactivating AI frame on tab:", tabId);

    await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        const frame = document.getElementById("ai-extension-frame-overlay");
        const glow = document.getElementById("ai-extension-glow-overlay");
        if (frame) {
          frame.remove();
        }
        if (glow) {
          glow.remove();
        }
        console.log("✅ AI frame and glow overlay deactivated");
      },
    });

    return { success: true, tabId };
  } catch (error) {
    console.error("Error deactivating AI frame:", error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetActiveTab() {
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    return { success: true, tab };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetAllTabs() {
  try {
    const tabs = await browser.tabs.query({});
    return { success: true, tabs };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleExecuteAction(payload: any) {
  try {
    const { action, tabId } = payload;

    // Inject content script if needed
    // Note: Make sure this file path is correct in the WXT project
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["/content-scripts/content.js"],
    });

    // Send action to content script
    const response = await browser.tabs.sendMessage(tabId, {
      type: "PERFORM_ACTION",
      action,
    });

    return { success: true, response };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGeminiRequest(payload: any) {
  try {
    const { prompt, apiKey } = payload;

    // Import Gemini dynamically
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return { success: true, text };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleRunGeneratedAgent(payload: any) {
  try {
    const { action_plan, tabId } = payload;

    if (!action_plan) {
      return { success: false, error: "No action plan provided" };
    }

    if (!tabId) {
      return { success: false, error: "No tab ID provided" };
    }

    console.log("Executing action plan for tab:", tabId, action_plan);

    const actions = action_plan.actions || [];
    const results = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      console.log(`Executing action ${i + 1}/${actions.length}:`, action.type);

      try {
        const result = await executeAction(tabId, action);
        results.push({ success: true, action: action.type, result });
      } catch (error) {
        const errorMsg = (error as Error).message;
        console.error(`Action ${i + 1} failed:`, errorMsg);
        results.push({ success: false, action: action.type, error: errorMsg });
        // Continue with next action even if one fails
      }
    }

    const allSucceeded = results.every((r) => r.success);
    return {
      success: allSucceeded,
      message: allSucceeded
        ? "All actions executed successfully"
        : "Some actions failed",
      results,
    };
  } catch (error) {
    console.error("Error executing action plan:", error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleExecuteAgentTool(payload: any) {
  try {
    const { tool_id, action_type, params } = payload;

    console.log("\n" + "=".repeat(60));
    console.log("🔧 HANDLE_EXECUTE_AGENT_TOOL CALLED");
    console.log("Tool ID:", tool_id);
    console.log("Action Type:", action_type);
    console.log("Params:", JSON.stringify(params, null, 2));
    console.log("=".repeat(60) + "\n");

    console.log(`📞 Calling executeAgentTool for: ${action_type}`);
    const result = await executeAgentTool(action_type, params);

    console.log(`✅ Tool execution complete: ${action_type}`);
    console.log("Result:", JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error("❌ Error executing agent tool:", error);
    console.error("Error stack:", (error as Error).stack);
    return { success: false, error: (error as Error).message };
  }
}

async function executeAction(tabId: number, action: any) {
  console.log("Executing action:", action.type, "with params:", action);

  // ============ TAB/WINDOW CONTROL ACTIONS ============
  // These operate at browser level, not DOM level

  switch (action.type) {
    case "OPEN_TAB": {
      const url = action.url || "about:blank";
      const active = action.active !== false; // default true

      const newTab = await browser.tabs.create({
        url: url,
        active: active,
      });

      // If active, wait for it to load before continuing
      if (active && url !== "about:blank") {
        await new Promise((resolve) => {
          const listener = (
            updatedTabId: number,
            changeInfo: chrome.tabs.TabChangeInfo
          ) => {
            if (
              updatedTabId === newTab.id &&
              changeInfo.status === "complete"
            ) {
              browser.tabs.onUpdated.removeListener(listener);
              resolve(null);
            }
          };
          browser.tabs.onUpdated.addListener(listener);

          // Timeout fallback
          setTimeout(resolve, 10000);
        });
      }

      return {
        message: `Opened new tab: ${url}`,
        tabId: newTab.id,
        url: newTab.url,
      };
    }

    case "CLOSE_TAB": {
      const targetTabId = action.tabId || tabId;
      await browser.tabs.remove(targetTabId);
      return { message: `Closed tab ${targetTabId}` };
    }

    case "SWITCH_TAB": {
      if (action.tabId) {
        await browser.tabs.update(action.tabId, { active: true });
        return { message: `Switched to tab ${action.tabId}` };
      } else if (action.direction) {
        // Switch to next/previous tab
        const allTabs = await browser.tabs.query({ currentWindow: true });
        const currentIndex = allTabs.findIndex((t) => t.id === tabId);

        let newIndex;
        if (action.direction === "next") {
          newIndex = (currentIndex + 1) % allTabs.length;
        } else {
          newIndex = (currentIndex - 1 + allTabs.length) % allTabs.length;
        }

        const targetTab = allTabs[newIndex];
        if (targetTab.id) {
          await browser.tabs.update(targetTab.id, { active: true });
          return { message: `Switched to ${action.direction} tab` };
        }
      }
      throw new Error("SWITCH_TAB requires tabId or direction");
    }

    case "NAVIGATE": {
      const targetTabId = action.tabId || tabId;
      const url = action.url;

      if (!url) {
        throw new Error("NAVIGATE requires url");
      }

      await browser.tabs.update(targetTabId, { url: url });

      // Wait for navigation to complete
      await new Promise((resolve) => {
        const listener = (
          updatedTabId: number,
          changeInfo: chrome.tabs.TabChangeInfo
        ) => {
          if (
            updatedTabId === targetTabId &&
            changeInfo.status === "complete"
          ) {
            browser.tabs.onUpdated.removeListener(listener);
            resolve(null);
          }
        };
        browser.tabs.onUpdated.addListener(listener);

        // Timeout fallback
        setTimeout(resolve, 10000);
      });

      return { message: `Navigated to ${url}`, tabId: targetTabId };
    }

    case "RELOAD_TAB": {
      const targetTabId = action.tabId || tabId;
      const bypassCache = action.bypassCache || false;

      await browser.tabs.reload(targetTabId, { bypassCache: bypassCache });

      // Wait for reload to complete
      await new Promise((resolve) => {
        const listener = (
          updatedTabId: number,
          changeInfo: chrome.tabs.TabChangeInfo
        ) => {
          if (
            updatedTabId === targetTabId &&
            changeInfo.status === "complete"
          ) {
            browser.tabs.onUpdated.removeListener(listener);
            resolve(null);
          }
        };
        browser.tabs.onUpdated.addListener(listener);

        // Timeout fallback
        setTimeout(resolve, 5000);
      });

      return { message: `Reloaded tab ${targetTabId}` };
    }

    case "DUPLICATE_TAB": {
      const targetTabId = action.tabId || tabId;
      const duplicatedTab = await browser.tabs.duplicate(targetTabId);
      return {
        message: `Duplicated tab ${targetTabId}`,
        newTabId: duplicatedTab.id,
      };
    }

    // ============ DOM MANIPULATION ACTIONS ============
    // These require injecting scripts into the page

    case "CLICK":
      console.log("Attempting CLICK on:", action.selector);
      return await browser.scripting.executeScript({
        target: { tabId },
        func: (selector: string) => {
          console.log("In page context - looking for:", selector);
          const el = document.querySelector(selector);
          if (!el) {
            console.error("Element not found:", selector);
            throw new Error(`Element not found: ${selector}`);
          }
          console.log("Found element:", el);
          (el as HTMLElement).click();
          return `Clicked: ${selector}`;
        },
        args: [action.selector],
      });

    case "TYPE":
      console.log(
        "Attempting TYPE on:",
        action.selector,
        "with value:",
        action.value
      );
      return await browser.scripting.executeScript({
        target: { tabId },
        func: (selector: string, text: string) => {
          console.log("In page context - looking for:", selector);
          const el = document.querySelector(selector);
          if (!el) {
            console.error("Element not found:", selector);
            throw new Error(`Element not found: ${selector}`);
          }

          console.log(
            "Found element:",
            el,
            "isContentEditable:",
            (el as HTMLElement).isContentEditable
          );

          // Handle contenteditable elements (like ChatGPT input)
          if (
            (el as HTMLElement).isContentEditable ||
            el.getAttribute("contenteditable") === "true"
          ) {
            // For contenteditable, we need to focus and set the text properly
            (el as HTMLElement).focus();

            // Try multiple methods for contenteditable
            if ((el as any).innerText !== undefined) {
              (el as HTMLElement).innerText = text;
            } else {
              (el as HTMLElement).textContent = text;
            }

            // Trigger events
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));

            // For some sites, we need to trigger keyboard events
            el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
          } else if (
            el.tagName === "TEXTAREA" ||
            (el.tagName === "INPUT" && (el as HTMLInputElement).type === "text")
          ) {
            // Standard input/textarea
            (el as HTMLInputElement).focus();
            (el as HTMLInputElement).value = text;

            // Trigger all the events that frameworks listen to
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
          } else {
            // Fallback for other elements
            (el as HTMLInputElement).value = text;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }

          return `Typed "${text.substring(0, 50)}${text.length > 50 ? "..." : ""
            }" into: ${selector}`;
        },
        args: [action.selector, action.value],
      });

    case "SCROLL":
      return await browser.scripting.executeScript({
        target: { tabId },
        func: (direction: string, amount: number) => {
          if (direction === "down") {
            window.scrollBy(0, amount || 500);
          } else if (direction === "up") {
            window.scrollBy(0, -(amount || 500));
          } else if (direction === "top") {
            window.scrollTo(0, 0);
          } else if (direction === "bottom") {
            window.scrollTo(0, document.body.scrollHeight);
          }
          return `Scrolled ${direction}`;
        },
        args: [action.direction || "down", action.amount],
      });

    case "WAIT":
      const waitTime = action.time || 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return `Waited ${waitTime}ms`;

    case "SELECT":
      return await browser.scripting.executeScript({
        target: { tabId },
        func: (selector: string, value: string) => {
          const el = document.querySelector(selector) as HTMLSelectElement;
          if (!el) throw new Error(`Element not found: ${selector}`);
          el.value = value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return `Selected: ${value}`;
        },
        args: [action.selector, action.value],
      });

    case "EXECUTE_SCRIPT":
      return await browser.scripting.executeScript({
        target: { tabId },
        func: new Function(action.script) as any,
      });

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// --- END: Helpers from WXT AI Assistant ---

// --- START: Helpers for Tab Tracking (from your Plasmo Project) ---
// These functions write to storage for the popup

async function getAllTabsInfo(): Promise<TabsData | null> {
  try {
    const allTabs = await browser.tabs.query({});
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    const allTabsUrls: TabInfo[] = allTabs.map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
    }));

    const activeTabInfo: TabInfo = {
      id: activeTab?.id,
      url: activeTab?.url,
      title: activeTab?.title,
      favIconUrl: activeTab?.favIconUrl,
    };

    return {
      allTabs: allTabsUrls,
      activeTab: activeTabInfo,
      totalTabs: allTabsUrls.length,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error fetching tabs for popup:", error);
    return null;
  }
}

async function storeTabsInfo(): Promise<TabsData | null> {
  const tabsInfo = await getAllTabsInfo();
  if (tabsInfo) {
    // Use standard browser.storage.local.set
    await browser.storage.local.set({
      tabsData: tabsInfo,
      allTabsUrls: tabsInfo.allTabs,
      activeTabUrl: tabsInfo.activeTab,
      totalTabs: tabsInfo.totalTabs,
      lastUpdated: tabsInfo.lastUpdated,
    });
    // console.log("Tabs info stored for popup:", tabsInfo);
    return tabsInfo;
  }
  return null;
}
// --- END: Helpers for Tab Tracking ---

// =================================================================
// SOPHISTICATED TOOL EXECUTION HANDLERS FOR AGENT
// =================================================================

/**
 * Execute sophisticated tools requested by the AI agent
 * This handles all browser automation tools defined in agent.py
 */
async function executeAgentTool(actionType: string, params: any): Promise<any> {
  console.log(`🎯 executeAgentTool - Action: ${actionType}`);

  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!activeTab.id) {
    console.error("❌ No active tab found");
    return { success: false, error: "No active tab found" };
  }

  const tabId = activeTab.id;
  console.log(`📍 Active tab ID: ${tabId}, URL: ${activeTab.url}`);

  try {
    console.log(`🔍 Looking for handler for action: ${actionType}`);

    switch (actionType) {
      case "GET_PAGE_INFO":
        console.log("➡️ Calling getPageInfo");
        return await getPageInfo(tabId, params);

      case "EXTRACT_DOM":
        console.log("➡️ Calling extractDomStructure");
        return await extractDomStructure(tabId, params);

      case "CLICK":
        console.log("➡️ Calling clickElement");
        return await clickElement(tabId, params);

      case "TYPE":
        console.log("➡️ Calling typeText");
        return await typeText(tabId, params);

      case "FILL_FORM":
        console.log("➡️ Calling fillFormFields");
        return await fillFormFields(tabId, params);

      case "SELECT_DROPDOWN":
        console.log("➡️ Calling selectDropdownOption");
        return await selectDropdownOption(tabId, params);

      case "WAIT_FOR_ELEMENT":
        console.log("➡️ Calling waitForElement");
        return await waitForElement(tabId, params);

      case "SCROLL":
        console.log("➡️ Calling scrollPage");
        return await scrollPage(tabId, params);

      case "OPEN_TAB":
        console.log("➡️ Calling openNewTab");
        return await openNewTab(params);

      case "CLOSE_TAB":
        console.log("➡️ Calling closeCurrentTab");
        return await closeCurrentTab(tabId);

      case "SWITCH_TAB":
        console.log("➡️ Calling switchTab");
        return await switchTab(params);

      case "NAVIGATE":
        console.log("➡️ Calling navigateToUrl");
        return await navigateToUrl(tabId, params);

      case "GET_ALL_TABS":
        console.log("➡️ Calling getAllTabs");
        return await getAllTabs();

      case "SCREENSHOT":
        console.log("➡️ Calling takeScreenshot");
        return await takeScreenshot(tabId, params);

      case "GET_ELEMENT_TEXT":
        console.log("➡️ Calling getElementText");
        return await getElementText(tabId, params);

      case "GET_ELEMENT_ATTRIBUTES":
        console.log("➡️ Calling getElementAttributes");
        return await getElementAttributes(tabId, params);

      case "EXECUTE_SCRIPT":
        console.log("➡️ Calling executeCustomScript");
        return await executeCustomScript(tabId, params);

      case "GET_COOKIES":
        console.log("➡️ Calling getCookies");
        return await getCookies(params);

      case "SET_COOKIE":
        console.log("➡️ Calling setCookie");
        return await setCookie(params);

      case "GET_LOCAL_STORAGE":
        console.log("➡️ Calling getLocalStorage");
        return await getLocalStorage(tabId, params);

      case "SET_LOCAL_STORAGE":
        console.log("➡️ Calling setLocalStorage");
        return await setLocalStorage(tabId, params);

      case "HOVER":
        console.log("➡️ Calling hoverElement");
        return await hoverElement(tabId, params);

      case "RELOAD_TAB":
        console.log("➡️ Calling reloadTab");
        return await reloadTab(tabId, params);

      case "GO_BACK":
        console.log("➡️ Calling goBack");
        return await goBack(tabId);

      case "GO_FORWARD":
        console.log("➡️ Calling goForward");
        return await goForward(tabId);

      case "FIND_ELEMENTS":
        console.log("➡️ Calling findElements");
        return await findElements(tabId, params);

      default:
        console.error(`❌ Unknown tool: ${actionType}`);
        return { success: false, error: `Unknown tool: ${actionType}` };
    }
  } catch (error) {
    console.error(`❌ Error in executeAgentTool for ${actionType}:`, error);
    console.error("Error stack:", (error as Error).stack);
    return { success: false, error: (error as Error).message };
  }
}

// Tool implementation functions

async function getPageInfo(tabId: number, params: any) {
  console.log("📍 getPageInfo called with params:", params);
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (include_dom: boolean, extract_interactive: boolean) => {
      const info: any = {
        url: window.location.href,
        title: document.title,
        hasVideo: !!document.querySelector("video"),
        hasAudio: !!document.querySelector("audio"),
        hasForm: !!document.querySelector("form"),
        imageCount: document.querySelectorAll("img").length,
        linkCount: document.querySelectorAll("a").length,
      };

      if (extract_interactive) {
        info.interactive = Array.from(
          document.querySelectorAll(
            'button, a, input, textarea, select, [role="button"], [contenteditable="true"]'
          )
        )
          .slice(0, 50)
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute("type"),
            id: el.id,
            class: el.className,
            name: el.getAttribute("name"),
            placeholder: el.getAttribute("placeholder"),
            ariaLabel: el.getAttribute("aria-label"),
            text: el.textContent?.trim().substring(0, 100),
          }));
      }

      return info;
    },
    args: [params.include_dom, params.extract_interactive],
  });

  return { success: true, data: result[0].result };
}

async function extractDomStructure(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (selector: string | null, depth: number) => {
      function extractElement(el: Element, currentDepth: number): any {
        if (currentDepth > depth) return null;

        const children =
          currentDepth < depth
            ? Array.from(el.children)
              .map((child) => extractElement(child, currentDepth + 1))
              .filter((c) => c !== null)
            : [];

        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          class: el.className || null,
          attributes: Array.from(el.attributes).reduce((acc: any, attr) => {
            acc[attr.name] = attr.value;
            return acc;
          }, {}),
          text: el.textContent?.trim().substring(0, 200),
          children: children,
        };
      }

      const root = selector ? document.querySelector(selector) : document.body;
      return root ? extractElement(root, 0) : null;
    },
    args: [params.selector, params.depth],
  });

  return { success: true, data: result[0].result };
}

async function clickElement(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (selector: string) => {
      const el = document.querySelector(selector) as HTMLElement;
      if (!el) throw new Error(`Element not found: ${selector}`);
      el.click();
      return `Clicked: ${selector}`;
    },
    args: [params.selector],
  });

  if (params.wait_after) {
    await new Promise((resolve) => setTimeout(resolve, params.wait_after));
  }

  return { success: true, message: result[0].result };
}

async function typeText(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (
      selector: string,
      text: string,
      clear_first: boolean,
      press_enter: boolean
    ) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Element not found: ${selector}`);

      if (clear_first && (el as HTMLInputElement).value !== undefined) {
        (el as HTMLInputElement).value = "";
      }

      if ((el as HTMLElement).isContentEditable) {
        (el as HTMLElement).focus();
        (el as HTMLElement).textContent = text;
      } else {
        (el as HTMLInputElement).value = text;
      }

      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));

      if (press_enter) {
        el.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        );
      }

      return `Typed text into: ${selector}`;
    },
    args: [
      params.selector,
      params.text,
      params.clear_first,
      params.press_enter,
    ],
  });

  return { success: true, message: result[0].result };
}

async function fillFormFields(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (fields: Record<string, string>, submitSelector: string | null) => {
      const results: string[] = [];

      for (const [selector, value] of Object.entries(fields)) {
        const el = document.querySelector(selector) as HTMLInputElement;
        if (el) {
          el.value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          results.push(`Filled ${selector}`);
        } else {
          results.push(`Not found: ${selector}`);
        }
      }

      if (submitSelector) {
        const submitBtn = document.querySelector(submitSelector) as HTMLElement;
        if (submitBtn) {
          submitBtn.click();
          results.push(`Submitted form via ${submitSelector}`);
        }
      }

      return results;
    },
    args: [params.fields, params.submit_selector],
  });

  return { success: true, results: result[0].result };
}

async function selectDropdownOption(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (
      selector: string,
      value: string | null,
      text: string | null,
      index: number | null
    ) => {
      const el = document.querySelector(selector) as HTMLSelectElement;
      if (!el) throw new Error(`Element not found: ${selector}`);

      if (value !== null) {
        el.value = value;
      } else if (text !== null) {
        const option = Array.from(el.options).find((opt) =>
          opt.text.includes(text)
        );
        if (option) el.value = option.value;
      } else if (index !== null) {
        el.selectedIndex = index;
      }

      el.dispatchEvent(new Event("change", { bubbles: true }));
      return `Selected option in: ${selector}`;
    },
    args: [params.selector, params.value, params.text, params.index],
  });

  return { success: true, message: result[0].result };
}

async function waitForElement(tabId: number, params: any) {
  const startTime = Date.now();
  const timeout = params.timeout || 10000;
  const condition = params.condition || "visible";

  while (Date.now() - startTime < timeout) {
    const result = await browser.scripting.executeScript({
      target: { tabId },
      func: (selector: string, cond: string) => {
        const el = document.querySelector(selector);
        if (!el) return false;

        if (cond === "exists") return true;
        if (cond === "visible") {
          const style = window.getComputedStyle(el);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            (el as HTMLElement).offsetParent !== null
          );
        }
        if (cond === "hidden") {
          const style = window.getComputedStyle(el);
          return (
            style.display === "none" ||
            style.visibility === "hidden" ||
            (el as HTMLElement).offsetParent === null
          );
        }
        return false;
      },
      args: [params.selector, condition],
    });

    if (result[0].result) {
      return {
        success: true,
        message: `Element ${params.selector} is ${condition}`,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    success: false,
    error: `Timeout waiting for ${params.selector} to be ${condition}`,
  };
}

async function scrollPage(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (direction: string, amount: number, toElement: string | null) => {
      if (toElement) {
        const el = document.querySelector(toElement);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          return `Scrolled to element: ${toElement}`;
        }
      }

      if (direction === "down") {
        window.scrollBy({ top: amount, behavior: "smooth" });
      } else if (direction === "up") {
        window.scrollBy({ top: -amount, behavior: "smooth" });
      } else if (direction === "top") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (direction === "bottom") {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: "smooth",
        });
      }

      return `Scrolled ${direction}`;
    },
    args: [params.direction, params.amount, params.to_element],
  });

  return { success: true, message: result[0].result };
}

async function openNewTab(params: any) {
  console.log("📍 openNewTab called with params:", params);
  const newTab = await browser.tabs.create({
    url: params.url || "about:blank",
    active: params.active !== false, // default to true
  });

  console.log("✅ New tab created:", newTab.id, newTab.url);
  return { success: true, tabId: newTab.id, url: newTab.url };
}

async function closeCurrentTab(tabId: number) {
  await browser.tabs.remove(tabId);
  return { success: true, message: `Closed tab ${tabId}` };
}

async function switchTab(params: any) {
  if (params.tab_id) {
    await browser.tabs.update(params.tab_id, { active: true });
    return { success: true, message: `Switched to tab ${params.tab_id}` };
  } else if (params.direction) {
    const allTabs = await browser.tabs.query({ currentWindow: true });
    const activeTab = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const currentIndex = allTabs.findIndex((t) => t.id === activeTab[0].id);

    let newIndex;
    if (params.direction === "next") {
      newIndex = (currentIndex + 1) % allTabs.length;
    } else {
      newIndex = (currentIndex - 1 + allTabs.length) % allTabs.length;
    }

    const targetTab = allTabs[newIndex];
    if (targetTab.id) {
      await browser.tabs.update(targetTab.id, { active: true });
      return { success: true, message: `Switched to ${params.direction} tab` };
    }
  }

  return { success: false, error: "Invalid switch tab parameters" };
}

async function navigateToUrl(tabId: number, params: any) {
  console.log("📍 navigateToUrl called with params:", params);
  await browser.tabs.update(tabId, { url: params.url });

  if (params.wait_for_load) {
    await new Promise((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo
      ) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          browser.tabs.onUpdated.removeListener(listener);
          resolve(null);
        }
      };
      browser.tabs.onUpdated.addListener(listener);
      setTimeout(resolve, 10000);
    });
  }

  return { success: true, message: `Navigated to ${params.url}` };
}

async function getAllTabs() {
  const tabs = await browser.tabs.query({});
  const tabsInfo = tabs.map((tab) => ({
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active: tab.active,
  }));

  return { success: true, tabs: tabsInfo };
}

async function takeScreenshot(tabId: number, params: any) {
  // Note: Full page screenshots require additional logic
  const dataUrl = await browser.tabs.captureVisibleTab();
  return { success: true, screenshot: dataUrl };
}

async function getElementText(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (selector: string, attribute: string | null) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Element not found: ${selector}`);

      if (attribute) {
        return el.getAttribute(attribute);
      }

      return el.textContent?.trim();
    },
    args: [params.selector, params.attribute],
  });

  return { success: true, text: result[0].result };
}

async function getElementAttributes(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Element not found: ${selector}`);

      const attrs: Record<string, string> = {};
      for (const attr of el.attributes) {
        attrs[attr.name] = attr.value;
      }

      return attrs;
    },
    args: [params.selector],
  });

  return { success: true, attributes: result[0].result };
}

async function executeCustomScript(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: new Function("args", params.script) as any,
    args: params.args || [],
  });

  return { success: true, result: result[0].result };
}

async function getCookies(params: any) {
  const allCookies = await browser.cookies.getAll(
    params.url ? { url: params.url } : {}
  );

  // Filter to only essential authentication/session cookies
  const authKeywords = [
    "session",
    "auth",
    "token",
    "user",
    "login",
    "ssid",
    "sid",
    "hsid",
    "account",
    "credentials",
  ];

  const essentialCookies = allCookies.filter((cookie) => {
    const nameLower = cookie.name.toLowerCase();
    return authKeywords.some((keyword) => nameLower.includes(keyword));
  });

  // If no auth cookies found, return first 5 cookies as fallback
  const cookiesToReturn =
    essentialCookies.length > 0
      ? essentialCookies.slice(0, 10) // Max 10 auth cookies
      : allCookies.slice(0, 5); // Or first 5 general cookies

  // Return minimal cookie info (name, value, domain only)
  const simplifiedCookies = cookiesToReturn.map((cookie) => ({
    name: cookie.name,
    value:
      cookie.value.length > 100
        ? cookie.value.substring(0, 100) + "..."
        : cookie.value,
    domain: cookie.domain,
  }));

  return {
    success: true,
    cookies: simplifiedCookies,
    total_cookies: allCookies.length,
    returned_cookies: simplifiedCookies.length,
    filtered: essentialCookies.length > 0,
  };
}

async function setCookie(params: any) {
  await browser.cookies.set({
    name: params.name,
    value: params.value,
    domain: params.domain,
    path: params.path || "/",
    expirationDate: params.expires,
  });

  return { success: true, message: `Cookie ${params.name} set` };
}

async function getLocalStorage(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (key: string | null) => {
      if (key) {
        return localStorage.getItem(key);
      }

      const all: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) all[k] = localStorage.getItem(k) || "";
      }

      return all;
    },
    args: [params.key],
  });

  return { success: true, data: result[0].result };
}

async function setLocalStorage(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (key: string, value: string) => {
      localStorage.setItem(key, value);
      return `Set ${key} in localStorage`;
    },
    args: [params.key, params.value],
  });

  return { success: true, message: result[0].result };
}

async function hoverElement(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (selector: string) => {
      const el = document.querySelector(selector) as HTMLElement;
      if (!el) throw new Error(`Element not found: ${selector}`);

      const event = new MouseEvent("mouseover", { bubbles: true });
      el.dispatchEvent(event);

      return `Hovered over: ${selector}`;
    },
    args: [params.selector],
  });

  if (params.duration) {
    await new Promise((resolve) => setTimeout(resolve, params.duration));
  }

  return { success: true, message: result[0].result };
}

async function reloadTab(tabId: number, params: any) {
  await browser.tabs.reload(tabId, { bypassCache: params.bypass_cache });

  await new Promise((resolve) => {
    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        browser.tabs.onUpdated.removeListener(listener);
        resolve(null);
      }
    };
    browser.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 5000);
  });

  return { success: true, message: "Tab reloaded" };
}

async function goBack(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    func: () => window.history.back(),
  });

  return { success: true, message: "Navigated back" };
}

async function goForward(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    func: () => window.history.forward(),
  });

  return { success: true, message: "Navigated forward" };
}

async function findElements(tabId: number, params: any) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: (selector: string, filterVisible: boolean) => {
      const elements = Array.from(document.querySelectorAll(selector));

      return elements
        .map((el, index) => {
          const isVisible = filterVisible
            ? window.getComputedStyle(el).display !== "none" &&
            window.getComputedStyle(el).visibility !== "hidden"
            : true;

          if (!isVisible && filterVisible) return null;

          return {
            index,
            tag: el.tagName.toLowerCase(),
            id: el.id,
            class: el.className,
            text: el.textContent?.trim().substring(0, 100),
          };
        })
        .filter((item) => item !== null);
    },
    args: [params.selector, params.filter_visible],
  });

  return { success: true, elements: result[0].result };
}
