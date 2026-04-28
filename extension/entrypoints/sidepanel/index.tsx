import React from "react";
import ReactDOM from "react-dom/client";
import type { Root } from "react-dom/client";
import App from "./App";

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "ai-assistant-sidebar",
      position: "inline",
      onMount: (container: HTMLElement) => {
        const root = ReactDOM.createRoot(container);
        root.render(<App />);
        return root;
      },
      onRemove: (root: Root | undefined) => {
        root?.unmount();
      },
    });

    (ui as unknown as { mount: () => void }).mount();
  },
});
