import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { FolderOpen, RefreshCw, MapPin, FileText } from "lucide-react";
import "./popup.css"; // This import is correct

// Interfaces from your background script
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

// Custom hook to replace Plasmo's useStorage
function useBrowserStorage<T>(
  key: string,
  defaultValue: T
): [T, (newValue: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);

  // Load initial value from storage
  useEffect(() => {
    browser.storage.local.get(key).then((result) => {
      if (result[key] !== undefined) {
        setValue(result[key]);
      }
    });
  }, [key]);

  // ▼▼▼ THIS IS THE FIX ▼▼▼
  // The listener function for storage changes needs two parameters:
  // (changes, areaName)
  // Your old code was missing 'areaName', which causes a runtime crash.
  useEffect(() => {
    const listener = (
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string
    ) => {
      // We must check if the change happened in 'local' storage
      // and if the key we care about is in the 'changes' object
      if (areaName === "local" && changes[key]) {
        setValue(changes[key].newValue);
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => {
      browser.storage.onChanged.removeListener(listener);
    };
  }, [key]);
  // ▲▲▲ THIS IS THE FIX ▲▲▲

  const setStoredValue = (newValue: T) => {
    // We don't need this, as the background script is writing the value
  };

  return [value, setStoredValue];
}

function IndexPopup() {
  const [tabsData] = useBrowserStorage<TabsData | null>("tabsData", null);
  const [activeTabUrl] = useBrowserStorage<TabInfo | null>(
    "activeTabUrl",
    null
  );

  // Notify active tab when popup opens
  useEffect(() => {
    const activateFrame = async () => {
      try {
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab.id) {
          await browser.runtime.sendMessage({
            type: "ACTIVATE_AI_FRAME",
            tabId: tab.id,
          });
          console.log("AI frame activation requested");
        }
      } catch (error) {
        console.log("Could not activate AI frame:", error);
      }
    };

    activateFrame();

    // Cleanup: deactivate frame when popup might close
    return () => {
      browser.tabs
        .query({ active: true, currentWindow: true })
        .then(([tab]) => {
          if (tab.id) {
            browser.runtime
              .sendMessage({
                type: "DEACTIVATE_AI_FRAME",
                tabId: tab.id,
              })
              .catch(() => {});
          }
        });
    };
  }, []);

  const handleRefresh = () => {
    console.log("Refresh clicked");
  };

  // Your UI was commented out, I have uncommented it.
  return (
    <div className="popup-container">
      <div className="header">
        <h2 className="header-title">
          <FolderOpen size={18} className="header-icon" />
          Tabs Manager
        </h2>
        <button onClick={handleRefresh} className="refresh-btn">
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="section active-tab-section">
        <h3 className="section-title">
          <MapPin size={14} className="section-icon" />
          Active Tab
        </h3>
        {activeTabUrl ? (
          <div className="tab-item active">
            {activeTabUrl.favIconUrl && (
              <img src={activeTabUrl.favIconUrl} alt="" className="favicon" />
            )}
            <div className="tab-info">
              <div className="tab-title">
                {activeTabUrl.title || "No title"}
              </div>
              <div className="tab-url">{activeTabUrl.url || "No URL"}</div>
            </div>
          </div>
        ) : (
          <p>Loading active tab...</p>
        )}
      </div>
      <div className="section">
        <h3 className="section-title">
          <FileText size={14} className="section-icon" />
          All Tabs ({tabsData?.totalTabs || 0})
        </h3>
        <div className="tabs-list">
          {tabsData?.allTabs && tabsData.allTabs.length > 0 ? (
            tabsData.allTabs.map((tab, index) => (
              <div key={tab.id || index} className="tab-item">
                {tab.favIconUrl && (
                  <img src={tab.favIconUrl} alt="" className="favicon" />
                )}
                <div className="tab-info">
                  <div className="tab-title">{tab.title || "No title"}</div>
                  <div className="tab-url">{tab.url || "No URL"}</div>
                </div>
              </div>
            ))
          ) : (
            <p>No tabs found...</p>
          )}
        </div>
      </div>
      <div className="footer">
        <small>
          Last updated:{" "}
          {tabsData?.lastUpdated
            ? new Date(tabsData.lastUpdated).toLocaleTimeString()
            : "Never"}
        </small>
      </div>
    </div>
  );
}

// Mount the app
const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <IndexPopup />
    </React.StrictMode>
  );
} else {
  console.error("Popup root element #root not found!");
}
