import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { browser, type Browser } from "wxt/browser";
import { PanelRight, Search, X } from "@agentic-browser/shared/icons";
import { AppMark, Button, Pill } from "@agentic-browser/shared/ui";
import type { BridgeStatus } from "../utils/bridge/types";
import "@agentic-browser/shared/theme.css";
import "./popup.css";

type Tab = Browser.tabs.Tab;

function hostOf(url?: string) {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.protocol.startsWith("http") ? u.host.replace(/^www\./, "") : u.protocol.replace(":", "");
  } catch {
    return url;
  }
}

function Favicon({ tab }: { tab: Tab }) {
  const [broken, setBroken] = useState(false);
  if (tab.favIconUrl && !broken) {
    return <img className="pp-fav" src={tab.favIconUrl} alt="" onError={() => setBroken(true)} />;
  }
  return <span className="pp-fav pp-fav--blank">{(tab.title || hostOf(tab.url) || "?").charAt(0).toUpperCase()}</span>;
}

function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  useEffect(() => {
    const load = () => browser.tabs.query({ currentWindow: true }).then((t) => setTabs(t as Tab[]));
    load();
    const events = [browser.tabs.onUpdated, browser.tabs.onRemoved, browser.tabs.onActivated, browser.tabs.onCreated];
    events.forEach((e: any) => e.addListener(load));
    return () => events.forEach((e: any) => e.removeListener(load));
  }, []);
  return tabs;
}

function useBridgeStatus() {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  useEffect(() => {
    browser.storage.local.get("bridgeStatus").then((s: any) => s.bridgeStatus && setStatus(s.bridgeStatus));
    const onChange = (changes: Record<string, { newValue?: any }>, area: string) => {
      if (area === "local" && changes.bridgeStatus?.newValue) setStatus(changes.bridgeStatus.newValue);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  return status;
}

function Popup() {
  const tabs = useTabs();
  const bridge = useBridgeStatus();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const active = tabs.find((t) => t.active);

  // Show the agent frame on the page while the popup is open.
  useEffect(() => {
    let tabId: number | undefined;
    browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      tabId = tab?.id;
      if (tabId) browser.runtime.sendMessage({ type: "ACTIVATE_AI_FRAME", tabId }).catch(() => {});
    });
    return () => {
      if (tabId) browser.runtime.sendMessage({ type: "DEACTIVATE_AI_FRAME", tabId }).catch(() => {});
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tabs;
    return tabs.filter((t) => `${t.title} ${t.url}`.toLowerCase().includes(q));
  }, [tabs, query]);

  const openPanel = async () => {
    const win = await browser.windows.getCurrent();
    try {
      await (browser as any).sidePanel?.open?.({ windowId: win.id });
    } catch {
      /* Firefox: sidebar opens from its own toolbar button */
    }
    window.close();
  };

  const focusTab = async (tab: Tab) => {
    if (tab.id == null) return;
    await browser.tabs.update(tab.id, { active: true });
    window.close();
  };

  const bridgeTone = bridge?.state === "connected" ? "ok" : bridge?.state === "disabled" ? "neutral" : "warn";
  const bridgeLabel =
    bridge?.state === "connected" ? "MCP connected" : bridge?.state === "disabled" ? "MCP off" : "MCP waiting";

  return (
    <div className="pp">
      <header className="pp-head">
        <span className="pp-brand">
          <AppMark size={22} />
          Open DIA
        </span>
        <Pill tone={bridgeTone} title={bridge?.error || undefined}>{bridgeLabel}</Pill>
      </header>

      <Button variant="primary" size="lg" className="pp-open" icon={<PanelRight size={16} />} onClick={openPanel}>
        Open assistant
        <span className="pp-open-hint ab-mono">side panel</span>
      </Button>

      {active && (
        <div className="pp-current">
          <span className="ab-eyebrow">This tab</span>
          <div className="pp-current__row">
            <Favicon tab={active} />
            <div className="pp-tab__text">
              <div className="pp-tab__title">{active.title || "Untitled"}</div>
              <div className="pp-tab__url ab-mono">{hostOf(active.url)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="pp-list-head">
        <span className="ab-eyebrow">
          Tabs <span className="pp-count">{tabs.length}</span>
        </span>
        <label className="pp-search">
          <Search size={13} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter"
            aria-label="Filter tabs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) focusTab(filtered[0]);
              if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
              }
            }}
          />
          {query && (
            <button className="pp-search__clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear filter">
              <X size={12} />
            </button>
          )}
        </label>
      </div>

      <ul className="pp-list" role="list">
        {filtered.map((tab) => (
          <li key={tab.id}>
            <button className={`pp-tab${tab.active ? " is-active" : ""}`} onClick={() => focusTab(tab)} title={tab.url}>
              <Favicon tab={tab} />
              <span className="pp-tab__text">
                <span className="pp-tab__title">{tab.title || "Untitled"}</span>
                <span className="pp-tab__url ab-mono">{hostOf(tab.url)}</span>
              </span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="pp-empty">No tabs match "{query}"</li>}
      </ul>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
}
