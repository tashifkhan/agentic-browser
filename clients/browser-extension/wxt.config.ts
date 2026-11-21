import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Agentic Browser",
    description: "An agent in your side panel that reads and acts on your tabs, with the model and keys you choose.",
    permissions: [
      "activeTab",
      "tabs",
      "storage",
      "scripting",
      "identity",
      "sidePanel",
      "webNavigation",
      "webRequest",
      "cookies",
      "bookmarks",
      "history",
      "clipboardWrite",
      "clipboardRead",
      "notifications",
      "downloads",
      "microphone",
      "audioCapture",
      "contextMenus",
      "debugger",
      "alarms",
      "tabGroups",
    ],
    host_permissions: ["<all_urls>"],
    side_panel: {
      default_path: "sidepanel.html",
    },
  },
});
