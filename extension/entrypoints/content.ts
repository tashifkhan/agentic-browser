export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    console.log("Content script loaded on:", window.location.href);

    // Create and manage AI frame overlay
    let aiFrame: HTMLElement | null = null;
    let glowOverlay: HTMLElement | null = null;

    // function createAIFrame() {
    //   if (aiFrame) return; // Already exists

    //   // Remove any existing old styles first
    //   const oldStyles = document.querySelectorAll(
    //     "#ai-extension-animations, #ai-frame-styles"
    //   );
    //   oldStyles.forEach((style) => style.remove());

    //   // Remove any old overlays
    //   const oldOverlays = document.querySelectorAll(
    //     "#ai-extension-frame, #ai-extension-glow-overlay, #ai-extension-frame-overlay"
    //   );
    //   oldOverlays.forEach((overlay) => overlay.remove());

    //   // Create glowing overlay background
    //   glowOverlay = document.createElement("div");
    //   glowOverlay.id = "ai-extension-glow-overlay";
    //   glowOverlay.style.cssText = `
    //     position: fixed;
    //     top: 0;
    //     left: 0;
    //     right: 0;
    //     bottom: 0;
    //     width: 100vw;
    //     height: 100vh;
    //     pointer-events: none;
    //     z-index: 2147483646;
    //     background: radial-gradient(circle at center, rgba(128, 128, 128, 0.12) 0%, rgba(128, 128, 128, 0.04) 50%, transparent 100%);
    //     animation: ai-glow-pulse 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    //     transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    //   `;

    //   // Create animated border frame
    //   aiFrame = document.createElement("div");
    //   aiFrame.id = "ai-extension-frame";
    //   aiFrame.style.cssText = `
    //     position: fixed;
    //     top: 0;
    //     left: 0;
    //     right: 0;
    //     bottom: 0;
    //     width: 100vw;
    //     height: 100vh;
    //     pointer-events: none;
    //     z-index: 2147483647;
    //     border: 6px solid rgba(128, 128, 128, 0.7);
    //     border-radius: 4px;
    //     box-shadow: inset 0 0 100px rgba(128, 128, 128, 0.3),
    //                 inset 0 0 50px rgba(128, 128, 128, 0.4),
    //                 0 0 80px rgba(128, 128, 128, 0.5),
    //                 0 0 40px rgba(128, 128, 128, 0.6);
    //     animation: ai-frame-pulse 3.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    //     transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    //   `;

    //   // Add center AI indicator
    //   const centerIndicator = document.createElement("div");
    //   centerIndicator.id = "ai-center-indicator";
    //   centerIndicator.style.cssText = `
    //     position: absolute;
    //     top: 24px;
    //     left: 50%;
    //     transform: translateX(-50%);
    //     padding: 10px 20px;
    //     background: linear-gradient(135deg, rgba(128, 128, 128, 0.95) 0%, rgba(128, 128, 128, 0.85) 100%);
    //     color: white;
    //     font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    //     font-size: 13px;
    //     font-weight: 600;
    //     border-radius: 24px;
    //     box-shadow: 0 0 25px rgba(128, 128, 128, 0.7),
    //                 inset 0 0 15px rgba(255, 255, 255, 0.25),
    //                 0 4px 12px rgba(0, 0, 0, 0.15);
    //     animation: ai-indicator-pulse 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    //     letter-spacing: 1.2px;
    //     backdrop-filter: blur(8px);
    //     transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    //   `;
    //   centerIndicator.textContent = "🤖 AI AGENT ACTIVE";
    //   aiFrame.appendChild(centerIndicator);

    //   // Add scanning line effect
    //   const scanLine = document.createElement("div");
    //   scanLine.id = "ai-scan-line";
    //   scanLine.style.cssText = `
    //     position: absolute;
    //     top: 0;
    //     left: 0;
    //     width: 100%;
    //     height: 3px;
    //     background: linear-gradient(90deg, 
    //       transparent 0%, 
    //       transparent 20%,
    //       rgba(128, 128, 128, 0.6) 50%, 
    //       transparent 80%,
    //       transparent 100%);
    //     box-shadow: 0 0 15px rgba(128, 128, 128, 0.7),
    //                 0 0 30px rgba(128, 128, 128, 0.4);
    //     animation: ai-scan 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    //     opacity: 0;
    //   `;
    //   aiFrame.appendChild(scanLine);

    //   // Add keyframe animations
    //   const style = document.createElement("style");
    //   style.id = "ai-extension-animations";
    //   style.textContent = `
    //     @keyframes ai-frame-pulse {
    //       0%, 100% {
    //         border-color: rgba(128, 128, 128, 0.6);
    //         box-shadow: inset 0 0 100px rgba(128, 128, 128, 0.25),
    //                     inset 0 0 50px rgba(128, 128, 128, 0.35),
    //                     0 0 80px rgba(128, 128, 128, 0.4),
    //                     0 0 40px rgba(128, 128, 128, 0.5);
    //       }
    //       50% {
    //         border-color: rgba(128, 128, 128, 0.9);
    //         box-shadow: inset 0 0 140px rgba(128, 128, 128, 0.4),
    //                     inset 0 0 70px rgba(128, 128, 128, 0.5),
    //                     0 0 120px rgba(128, 128, 128, 0.6),
    //                     0 0 60px rgba(128, 128, 128, 0.7);
    //       }
    //     }

    //     @keyframes ai-glow-pulse {
    //       0%, 100% {
    //         opacity: 0.5;
    //         transform: scale(1);
    //       }
    //       50% {
    //         opacity: 0.8;
    //         transform: scale(1.01);
    //       }
    //     }

    //     @keyframes ai-indicator-pulse {
    //       0%, 100% {
    //         transform: translateX(-50%) scale(1);
    //         opacity: 0.95;
    //         box-shadow: 0 0 25px rgba(128, 128, 128, 0.7),
    //                     inset 0 0 15px rgba(255, 255, 255, 0.25);
    //       }
    //       50% {
    //         transform: translateX(-50%) scale(1.03);
    //         opacity: 1;
    //         box-shadow: 0 0 35px rgba(128, 128, 128, 0.9),
    //                     inset 0 0 20px rgba(255, 255, 255, 0.4);
    //       }
    //     }

    //     @keyframes ai-scan {
    //       0% {
    //         top: 0;
    //         opacity: 0;
    //       }
    //       10% {
    //         opacity: 1;
    //       }
    //       90% {
    //         opacity: 1;
    //       }
    //       100% {
    //         top: 100%;
    //         opacity: 0;
    //       }
    //     }
    //   `;
    //   document.head.appendChild(style);

    //   document.body.appendChild(glowOverlay);
    //   document.body.appendChild(aiFrame);
    //   console.log("AI frame and glow overlay activated");
    // }

    function removeAIFrame() {
      if (aiFrame) {
        aiFrame.remove();
        aiFrame = null;
      }
      if (glowOverlay) {
        glowOverlay.remove();
        glowOverlay = null;
      }
      console.log("AI frame and glow overlay deactivated");
    }

    // Listen for messages from background script
    // browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    //   if (message.type === "PERFORM_ACTION") {
    //     performAction(message.action).then(sendResponse);
    //     return true; // Keep channel open for async response
    //   }

    //   if (message.type === "TOGGLE_AI_FRAME") {
    //     if (message.active) {
    //       createAIFrame();
    //     } else {
    //       removeAIFrame();
    //     }
    //     sendResponse({ success: true });
    //     return true;
    //   }
    // });

    // Helper function to find elements
    function findElement(selector: string): HTMLElement | null {
      return document.querySelector(selector);
    }

    async function performAction(action: string): Promise<any> {
      console.log("Performing action:", action);

      // Parse action with AI or use simple keyword matching
      const actionLower = action.toLowerCase();

      try {
        // Play video action
        if (actionLower.includes("play") && actionLower.includes("video")) {
          const video = document.querySelector("video") as HTMLVideoElement;
          if (video) {
            video.play();
            return { success: true, message: "Video started playing" };
          }
          return { success: false, message: "No video found on page" };
        }

        // Pause video action
        if (actionLower.includes("pause") && actionLower.includes("video")) {
          const video = document.querySelector("video") as HTMLVideoElement;
          if (video) {
            video.pause();
            return { success: true, message: "Video paused" };
          }
          return { success: false, message: "No video found on page" };
        }

        // Click button action
        if (actionLower.includes("click")) {
          const buttons = Array.from(
            document.querySelectorAll('button, a, [role="button"]')
          );

          // Try to find button with matching text
          const matchingButton = buttons.find((btn) => {
            const text = btn.textContent?.toLowerCase() || "";
            return actionLower.split(" ").some((word) => text.includes(word));
          }) as HTMLElement;

          if (matchingButton) {
            matchingButton.click();
            return {
              success: true,
              message: `Clicked: ${matchingButton.textContent}`,
            };
          }
          return { success: false, message: "No matching button found" };
        }

        // Fill form action
        if (actionLower.includes("fill") || actionLower.includes("type")) {
          const input = document.querySelector(
            'input[type="text"], textarea'
          ) as HTMLInputElement;
          if (input) {
            const textToFill =
              action.split(/fill|type/i)[1]?.trim() || "Sample text";
            input.value = textToFill;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            return {
              success: true,
              message: `Filled input with: ${textToFill}`,
            };
          }
          return { success: false, message: "No input field found" };
        }

        // Scroll action
        if (actionLower.includes("scroll")) {
          if (actionLower.includes("down")) {
            window.scrollBy({ top: 500, behavior: "smooth" });
            return { success: true, message: "Scrolled down" };
          }
          if (actionLower.includes("up")) {
            window.scrollBy({ top: -500, behavior: "smooth" });
            return { success: true, message: "Scrolled up" };
          }
          window.scrollTo({ top: 0, behavior: "smooth" });
          return { success: true, message: "Scrolled to top" };
        }

        // Get page info
        if (
          actionLower.includes("info") ||
          actionLower.includes("tell me about")
        ) {
          return {
            success: true,
            message: "Page information",
            data: {
              title: document.title,
              url: window.location.href,
              hasVideo: !!document.querySelector("video"),
              hasForm: !!document.querySelector("form"),
              images: document.querySelectorAll("img").length,
            },
          };
        }

        return { success: false, message: "Action not recognized" };
      } catch (error) {
        return { success: false, message: (error as Error).message };
      }
    }
  },
});
