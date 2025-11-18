import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Open DIA",
    description: "AI-powered browser assistant with sidebar",
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
      "contextMenus",
      "downloads",
    ],
    host_permissions: ["<all_urls>"],
  },
});
