import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { Plug, RotateCw } from "@agentic-browser/shared/icons";
import {
  SettingsField as Field,
  SettingsSection as Section,
  SettingsStatusPill as StatusPill,
  settingsInputStyle as inputStyle,
} from "@agentic-browser/shared/settings-ui";
import { DEFAULT_BRIDGE_URL, type BridgeStatus } from "../../utils/bridge/types";

const STATE_LABEL: Record<string, string> = {
  connected: "connected",
  connecting: "connecting",
  disconnected: "not running",
  disabled: "off",
};

export function BridgeSection() {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [url, setUrl] = useState(DEFAULT_BRIDGE_URL);
  const [draftUrl, setDraftUrl] = useState("");

  useEffect(() => {
    browser.storage.local.get(["bridgeStatus", "bridgeEnabled", "bridgeUrl"]).then((s: any) => {
      if (s.bridgeStatus) setStatus(s.bridgeStatus);
      setEnabled(s.bridgeEnabled !== false);
      setUrl(s.bridgeUrl || DEFAULT_BRIDGE_URL);
    });
    const onChange = (changes: Record<string, { newValue?: any }>, area: string) => {
      if (area !== "local") return;
      if (changes.bridgeStatus?.newValue) setStatus(changes.bridgeStatus.newValue);
      if (changes.bridgeEnabled) setEnabled(changes.bridgeEnabled.newValue !== false);
      if (changes.bridgeUrl) setUrl(changes.bridgeUrl.newValue || DEFAULT_BRIDGE_URL);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);

  const state = status?.state ?? "disconnected";
  const ok = state === "connected" ? true : state === "disabled" ? null : false;

  return (
    <Section
      title="MCP bridge"
      icon={Plug}
      aside={<StatusPill ok={ok} label={STATE_LABEL[state] ?? state} />}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 0 4px", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, fontSize: 12, color: "var(--text-3)" }}>
          {state === "connected" ? (
            <>
              {status?.calls ? (
                <>
                  <span className="ab-mono" style={{ color: "var(--text)" }}>{status.calls}</span> calls
                  {status.lastMethod && (
                    <>
                      , last <span className="ab-mono">{status.lastMethod}</span>
                    </>
                  )}
                </>
              ) : (
                "Waiting for your agent's first call."
              )}
            </>
          ) : state === "disabled" ? (
            "Turned off. Agents can't reach this browser."
          ) : (
            status?.error ?? "Looking for agentic-mcp on this machine."
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="ab-btn ab-btn--sm" onClick={() => browser.runtime.sendMessage({ type: "BRIDGE_RECONNECT" })} disabled={!enabled}>
            <RotateCw size={12} /> Reconnect
          </button>
          <button
            className={`ab-btn ab-btn--sm${enabled ? " ab-btn--danger" : " ab-btn--primary"}`}
            onClick={() => browser.storage.local.set({ bridgeEnabled: !enabled })}
          >
            {enabled ? "Turn off" : "Turn on"}
          </button>
        </div>
      </div>

      <pre className="sheet__code">
        <span className="c"># install once, then register with your agents{"\n"}</span>
        uv tool install ./mcp_server{"\n"}
        agentic-mcp install
      </pre>

      <div style={{ marginTop: 14 }}>
        <Field label="Bridge address" hint="Only change this if you moved the bridge off port 5455.">
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder={url}
              style={{ ...inputStyle, fontFamily: "var(--font-code)", fontSize: 12 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draftUrl.trim()) {
                  browser.storage.local.set({ bridgeUrl: draftUrl.trim() });
                  setDraftUrl("");
                }
              }}
            />
            <button
              className="ab-btn"
              disabled={!draftUrl.trim()}
              onClick={() => {
                browser.storage.local.set({ bridgeUrl: draftUrl.trim() });
                setDraftUrl("");
              }}
            >
              Save
            </button>
            {url !== DEFAULT_BRIDGE_URL && (
              <button className="ab-btn ab-btn--ghost" onClick={() => browser.storage.local.remove("bridgeUrl")}>
                Reset
              </button>
            )}
          </div>
        </Field>
      </div>
    </Section>
  );
}

export default BridgeSection;
