import { useState, useEffect } from "react";
import { Settings, X } from "lucide-react";
import {
  api,
  type IntegrationsStatus,
  type OAuthConnection,
  type OAuthClientStatus,
  type SecretStatus,
  type ComposioConfigPublic,
  type PyJIITPublic,
} from "../lib/api";

const COMPOSIO_SUGGESTED = ["linkedin", "gmail", "google_calendar", "github", "notion", "slack"];

function StatusPill({
  ok,
  label,
  onClick,
}: {
  ok: boolean | null;
  label: string;
  onClick?: () => void;
}) {
  const bg = ok === true
    ? "var(--status-connected-bg)"
    : ok === false
      ? "var(--status-error-bg, rgba(220, 38, 38, 0.1))"
      : "var(--input-bg)";
  const color = ok === true
    ? "var(--status-connected-text)"
    : ok === false
      ? "var(--status-error-text, #dc2626)"
      : "var(--text-muted)";
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 999,
        background: bg,
        color,
        border: `1px solid ${color}`,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "var(--bg-color)",
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
      }}
    >
      <h2
        style={{
          fontSize: 14,
          fontWeight: 600,
          margin: "0 0 16px 0",
          color: "var(--text-primary)",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ children, noBorder, padding = "10px 0" }: { children: React.ReactNode; noBorder?: boolean; padding?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding,
        borderBottom: noBorder ? "none" : "1px solid var(--border-color)",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function btnStyle(variant: "primary" | "danger" | "ghost" = "ghost"): React.CSSProperties {
  const common: React.CSSProperties = {
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid var(--border-color)",
  };
  if (variant === "primary") return { ...common, background: "var(--accent-color)", color: "#fff", border: "none" };
  if (variant === "danger") return { ...common, background: "transparent", color: "#dc2626", borderColor: "#dc2626" };
  return { ...common, background: "var(--input-bg)", color: "var(--text-primary)" };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid var(--border-color)",
  background: "var(--input-bg)",
  color: "var(--text-primary)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em" }}>
        {label.toUpperCase()}
      </span>
      {children}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10002,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-color)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          padding: 20,
          minWidth: 380,
          maxWidth: 520,
          width: "90%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={btnStyle()}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

function OAuthSection({ oauth, clients, onChange }: { oauth: OAuthConnection[]; clients: OAuthClientStatus[]; onChange: () => void }) {
  const providers = ["google", "github"];
  const byProvider = Object.fromEntries((oauth || []).map((c) => [c.provider, c]));
  const clientByProvider = Object.fromEntries((clients || []).map((c) => [c.provider, c]));

  return (
    <Section title="OAuth integrations">
      {providers.map((p) => {
        const c = byProvider[p];
        const client = clientByProvider[p];
        const canConnect = client && client.client_id_source !== "unset" && client.client_secret_source !== "unset";
        return (
          <Row key={p}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong style={{ textTransform: "capitalize", fontSize: 13 }}>{p}</strong>
                <StatusPill ok={c ? c.status === "active" : false} label={c ? c.status : "not connected"} />
              </div>
              {c && (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {c.account_email || "(no email)"} · {c.scopes?.length ?? 0} scopes
                  {c.expires_at && ` · expires ${new Date(c.expires_at).toLocaleString()}`}
                </div>
              )}
              {!c && !canConnect && (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Configure client_id and client_secret below first.
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {!c && canConnect && (
                <a href={`${localStorage.getItem("baseUrl") || "http://localhost:5454"}/api/auth/${p}/start`} target="_blank" style={{ ...btnStyle("primary"), textDecoration: "none" }}>
                  Connect
                </a>
              )}
              {c && (
                <button style={btnStyle("danger")} onClick={async () => { await api.oauthDisconnect(p); onChange(); }}>
                  Disconnect
                </button>
              )}
            </div>
          </Row>
        );
      })}
    </Section>
  );
}

function OAuthClientsSection({ clients, onChange }: { clients: OAuthClientStatus[]; onChange: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const handleSave = async () => {
    await api.oauthClientSet(editing!, { client_id: clientId || undefined, client_secret: clientSecret || undefined });
    setEditing(null);
    setClientId("");
    setClientSecret("");
    onChange();
  };

  const handleClear = async (p: string) => {
    await api.oauthClientClear(p);
    onChange();
  };

  return (
    <Section title="OAuth client setup">
      {clients?.map?.((c) => (
        <Row key={c.provider}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <strong style={{ textTransform: "capitalize", fontSize: 13 }}>{c.provider}</strong>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              client_id ({c.client_id_source}): <code>{c.client_id_masked || "—"}</code>
              {" · "}
              client_secret ({c.client_secret_source}): <code>{c.client_secret_masked || "—"}</code>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={btnStyle()} onClick={() => setEditing(c.provider)}>Edit</button>
            {(c.client_id_source === "db" || c.client_secret_source === "db") && (
              <button style={btnStyle("danger")} onClick={() => handleClear(c.provider)}>Reset</button>
            )}
          </div>
        </Row>
      ))}

      {editing && (
        <Modal title={`Edit ${editing} OAuth client`} onClose={() => setEditing(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Client ID">
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Leave blank to keep existing" style={inputStyle} />
            </Field>
            <Field label="Client secret">
              <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Leave blank to keep existing" style={inputStyle} />
            </Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btnStyle()} onClick={() => setEditing(null)}>Cancel</button>
              <button style={btnStyle("primary")} disabled={!clientId && !clientSecret} onClick={handleSave}>Save</button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

function LLMSection({ llm, onChange }: { llm: any; onChange: () => void }) {
  const [provider, setProvider] = useState(llm?.effective?.provider || "");
  const [model, setModel] = useState(llm?.effective?.model || "");
  const [temp, setTemp] = useState(String(llm?.effective?.temperature ?? 0.4));
  const [editingSecret, setEditingSecret] = useState<any>(null);
  const [secretValue, setSecretValue] = useState("");

  const providers = llm?.providers_configured ? Object.keys(llm.providers_configured) : [];

  const handleSave = async () => {
    await api.llmSet({ provider, model, temperature: parseFloat(temp) || 0.4 });
    onChange();
  };

  const handleReset = async () => {
    await api.llmClear();
    onChange();
  };

  return (
    <Section title="LLM model">
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>
        Source: <strong>{llm?.effective?.source || "unknown"}</strong> ·{" "}
        Effective: <code>{llm?.effective?.provider || "—"}/{llm?.effective?.model || "—"}</code> @ {llm?.effective?.temperature ?? "—"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 100px", gap: 10, alignItems: "end" }}>
        <Field label="Provider">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} style={inputStyle}>
            {providers.map((p) => <option key={p} value={p}>{p} {llm.providers_configured[p] ? "" : "(no key)"}</option>)}
          </select>
        </Field>
        <Field label="Model">
          <input value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle} placeholder="e.g. gemini-2.5-flash" />
        </Field>
        <Field label="Temp">
          <input value={temp} onChange={(e) => setTemp(e.target.value)} style={inputStyle} inputMode="decimal" />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button style={btnStyle("primary")} onClick={handleSave}>Save override</button>
        <button style={btnStyle()} onClick={handleReset}>Reset to .env default</button>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border-color)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>
          PROVIDER KEYS · click to edit
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {llm?.secrets?.map?.((s: any) => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong style={{ fontSize: 12 }}>{s.name}</strong>
                <StatusPill ok={s.source === "db" || s.source === "env"} label={s.source || "unset"} />
                {s.masked && <code style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.masked}</code>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={btnStyle()} onClick={() => { setEditingSecret(s); setSecretValue(""); }}>Edit</button>
                {s.db_set && (
                  <button style={btnStyle("danger")} onClick={async () => { await api.secretClear(s.name); onChange(); }}>Reset</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingSecret && (
        <Modal title={`Set ${editingSecret.name}`} onClose={() => setEditingSecret(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Stored encrypted. Overrides the <code>{editingSecret.env_var}</code> env var.
            </div>
            <Field label="Value">
              <input type="password" value={secretValue} onChange={(e) => setSecretValue(e.target.value)} style={inputStyle} autoFocus placeholder="Paste new value" />
            </Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btnStyle()} onClick={() => setEditingSecret(null)}>Cancel</button>
              <button style={btnStyle("primary")} disabled={!secretValue} onClick={async () => { await api.secretSet(editingSecret.name, secretValue); setEditingSecret(null); onChange(); }}>Save</button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

function SearchSection({ search, onChange }: { search: any; onChange: () => void }) {
  const [apiKey, setApiKey] = useState("");
  return (
    <Section title="Search backend">
      <Row noBorder>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <strong style={{ fontSize: 13 }}>Tavily Search Adapter</strong>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{search?.api_key_masked || "No key set"}</div>
        </div>
        <StatusPill ok={search?.configured || false} label={search?.configured ? "configured" : "missing"} />
      </Row>
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-color)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>API KEY</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter Tavily API key" style={inputStyle} />
          <button style={btnStyle("primary")} disabled={!apiKey.trim()} onClick={async () => {
            await api.secretSet("tavily_api_key", apiKey);
            setApiKey("");
            onChange();
          }}>Apply</button>
        </div>
      </div>
    </Section>
  );
}

function ComposioSection({ status, config, onChange }: { status: any; config: any; onChange: () => void }) {
  const [toolkit, setToolkit] = useState("");
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState("");

  return (
    <Section title="Composio">
      <Row>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontSize: 13 }}>Configuration</strong>
            <StatusPill ok={status?.configured || false} label={status?.configured ? "configured" : "missing"} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            api_key ({config?.api_key_source || "unknown"}): <code>{config?.api_key_masked || "—"}</code>
            {" · "}
            user_id ({config?.user_id_source || "unknown"}): <code>{config?.user_id || "—"}</code>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={btnStyle()} onClick={() => setEditing(true)}>Edit</button>
          {(config?.api_key_source === "db" || config?.user_id_source === "db") && (
            <button style={btnStyle("danger")} onClick={async () => { await api.composioConfigClear(); onChange(); }}>Reset</button>
          )}
        </div>
      </Row>

      {status?.configured && (
        <>
          {status?.error && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 10 }}>{status.error}</div>}
          {(status?.connected?.length || 0) === 0 && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "10px 0" }}>No connected toolkits.</div>
          )}
          {status?.connected?.map?.((c: any) => (
            <Row key={c.id || Math.random()}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong style={{ fontSize: 13 }}>{c.toolkit || "(unknown)"}</strong>
                <StatusPill ok={c.status === "ACTIVE" || c.status === "active"} label={c.status || "?"} />
              </div>
              {c.id && (
                <button style={btnStyle("danger")} onClick={async () => { await api.composioDisconnect(c.id); onChange(); }}>Disconnect</button>
              )}
            </Row>
          ))}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-color)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>CONNECT NEW TOOLKIT</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={toolkit} onChange={(e) => setToolkit(e.target.value)} placeholder="e.g. linkedin, gmail, github" style={inputStyle} list="composio-suggestions" />
              <datalist id="composio-suggestions">{COMPOSIO_SUGGESTED.map(s => <option key={s} value={s} />)}</datalist>
              <button style={btnStyle("primary")} disabled={!toolkit.trim()} onClick={async () => {
                const data = await api.composioConnect(toolkit.trim());
                if (data.redirect_url) window.open(data.redirect_url, "_blank");
                setToolkit("");
                onChange();
              }}>Connect</button>
            </div>
          </div>
        </>
      )}

      {editing && (
        <Modal title="Composio configuration" onClose={() => setEditing(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="API key">
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Leave blank to keep existing" style={inputStyle} />
            </Field>
            <Field label="User ID">
              <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={config?.user_id || "Leave blank to keep existing"} style={inputStyle} />
            </Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btnStyle()} onClick={() => setEditing(false)}>Cancel</button>
              <button style={btnStyle("primary")} disabled={!apiKey && !userId} onClick={async () => { await api.composioConfigSet({ api_key: apiKey || undefined, user_id: userId || undefined }); setEditing(false); onChange(); }}>Save</button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

function PyJIITSection({ pyjiit, onChange }: { pyjiit: PyJIITPublic; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Section title="PyJIIT (J-Portal)">
      <Row>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontSize: 13 }}>Credentials</strong>
            <StatusPill ok={pyjiit?.configured || false} label={pyjiit?.configured ? "configured" : "not set"} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            username: <code>{pyjiit?.username || "—"}</code> · password: <code>{pyjiit?.password_masked || "—"}</code>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={btnStyle()} onClick={() => setEditing(true)}>Edit</button>
          {pyjiit?.configured && <button style={btnStyle("danger")} onClick={async () => { await api.pyjiitClear(); onChange(); }}>Reset</button>}
        </div>
      </Row>

      {editing && (
        <Modal title="PyJIIT credentials" onClose={() => setEditing(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Enrolment number / username">
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={pyjiit?.username || "Leave blank to keep existing"} style={inputStyle} />
            </Field>
            <Field label="Password">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep existing" style={inputStyle} />
            </Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btnStyle()} onClick={() => setEditing(false)}>Cancel</button>
              <button style={btnStyle("primary")} disabled={!username && !password} onClick={async () => { await api.pyjiitSet({ username: username || undefined, password: password || undefined }); setEditing(false); onChange(); }}>Save</button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function UnifiedSettingsMenu({
  isOpen,
  onToggle,
  position = { bottom: "24px", right: "24px" },
  handleLogout,
}: any) {
  const [data, setData] = useState<IntegrationsStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await api.integrationsStatus();
      setData(res);
    } catch (e) {
      console.error("Failed load settings", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) refresh();
    const inv = setInterval(() => { if (isOpen) refresh(); }, 8000);
    return () => clearInterval(inv);
  }, [isOpen]);

  return (
    <>
      {!isOpen && (
        <button onClick={onToggle} className="settings-toggle" style={{
          position: "fixed", ...position, width: 44, height: 44, borderRadius: "50%",
          background: "var(--bg-3)", border: "1px solid var(--border)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10000,
          color: "var(--text-primary)", transition: "transform 0.2s"
        }}>
          <Settings size={20} />
        </button>
      )}

      {isOpen && (
        <div className="fade-in" style={{
          position: "fixed", inset: 0, background: "var(--bg-color)", zIndex: 10001,
          display: "flex", flexDirection: "column", animation: "slideUp 0.3s"
        }}>
          <div style={{
            padding: "16px 20px", borderBottom: "1px solid var(--border-color)",
            display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-2)"
          }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Settings</h1>
            <button onClick={onToggle} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
              <X size={24} strokeWidth={2.5} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
            {!data && loading ? (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 30 }}>Loading settings…</div>
            ) : data ? (
              <>
                <OAuthSection oauth={data.oauth} clients={data.oauth_clients} onChange={refresh} />
                <OAuthClientsSection clients={data.oauth_clients} onChange={refresh} />
                <LLMSection llm={data.llm} onChange={refresh} />
                <SearchSection search={data.search} onChange={refresh} />
                <ComposioSection status={data.composio} config={data.composio_config} onChange={refresh} />
                <PyJIITSection pyjiit={data.pyjiit} onChange={refresh} />
                
                <Section title="Native tools">
                  {data.native_tools?.map?.((t) => (
                    <Row key={t.id}>
                      <strong style={{ fontSize: 13 }}>{t.label}</strong>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.auth}</span>
                    </Row>
                  ))}
                </Section>

                <Section title="Registered agents">
                  {data.agents?.map?.((a) => (
                    <Row key={a.id}>
                      <strong style={{ fontSize: 13 }}>{a.label}</strong>
                      <code style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.module}</code>
                    </Row>
                  ))}
                </Section>

                <Section title="Infrastructure">
                  {data.infra && Object.entries(data.infra).map(([k, v]: [string, any]) => (
                    <Row key={k}>
                      <strong style={{ fontSize: 13, textTransform: "capitalize" }}>{k}</strong>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <StatusPill ok={v.ok} label={v.ok ? "ok" : "down"} />
                        {v.error && (
                          <span style={{ fontSize: 10, color: "#dc2626", maxWidth: 240, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {v.error}
                          </span>
                        )}
                      </div>
                    </Row>
                  ))}
                </Section>

                <Section title="Account">
                  <button style={{ ...btnStyle("danger"), width: "100%", padding: "12px", fontWeight: 700 }} onClick={handleLogout}>Log Out</button>
                </Section>
                <div style={{ height: 40 }} />
              </>
            ) : (
              <div style={{ textAlign: "center", color: "#dc2626", padding: 30 }}>Failed to load settings.</div>
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .settings-toggle:hover { transform: scale(1.05); }
      `}</style>
    </>
  );
}
