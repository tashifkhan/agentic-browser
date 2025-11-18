import { useState, useEffect } from "react";

interface Tab {
  id?: number;
  title?: string;
  url?: string;
  active?: boolean;
}

export function useTabManagement() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<Tab | null>(null);

  useEffect(() => {
    loadTabs();

    const handleTabActivated = async (activeInfo: {
      tabId: number;
      windowId: number;
    }) => {
      try {
        const tab = await browser.tabs.get(activeInfo.tabId);
        setActiveTab({
          id: tab.id,
          title: tab.title,
          url: tab.url,
          active: true,
        });
        console.log("Active tab changed:", tab.title);
      } catch (err) {
        console.log("Error getting tab:", err);
      }
    };

    const handleTabUpdated = async (
      tabId: number,
      changeInfo: any,
      tab: any
    ) => {
      try {
        const [activeTabQuery] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });

        if (activeTabQuery && activeTabQuery.id === tabId) {
          setActiveTab({
            id: tab.id,
            title: tab.title,
            url: tab.url,
            active: true,
          });
          console.log("Active tab updated:", tab.title);
        }
      } catch (err) {
        console.log("Error in handleTabUpdated:", err);
      }
    };

    const handleTabCreated = async (tab: any) => {
      if (tab.active) {
        setActiveTab({
          id: tab.id,
          title: tab.title,
          url: tab.url,
          active: true,
        });
        console.log("New active tab created:", tab.title);
      }
    };

    browser.tabs.onActivated.addListener(handleTabActivated);
    browser.tabs.onUpdated.addListener(handleTabUpdated);
    browser.tabs.onCreated.addListener(handleTabCreated);

    return () => {
      browser.tabs.onActivated.removeListener(handleTabActivated);
      browser.tabs.onUpdated.removeListener(handleTabUpdated);
      browser.tabs.onCreated.removeListener(handleTabCreated);
    };
  }, []);

  const loadTabs = async () => {
    const result = await browser.runtime.sendMessage({ type: "GET_ALL_TABS" });
    if (result.success) {
      setTabs(result.tabs);
      const active = result.tabs.find((t: Tab) => t.active);
      setActiveTab(active || null);
    }
  };

  return { tabs, activeTab };
}
