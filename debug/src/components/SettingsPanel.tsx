import { useState } from "react";
import { Info, ChevronDown, Settings2, Link as LinkIcon, Bot, Server, Wrench, KeyRound, Globe, HardDrive, Database } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type IntegrationsStatus,
  type SecretStatus,
  type ComposioConfigPublic,
  type ComposioConnection,
  type ComposioToolSummary,
  type PyJIITPublic,
} from "../lib/api";

const COMPOSIO_SUGGESTED = ["gmail", "googlecalendar", "github", "notion", "slack", "linear", "linkedin", "instagram", "aeroleads"];

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
        fontSize: 10,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 4, // Industrial, boxy
        background: bg,
        color,
        border: `1px solid ${ok === null ? "var(--border-color)" : "transparent"}`,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

function Section({ title, icon: Icon, defaultOpen = false, children }: { title: string; icon?: any; defaultOpen?: boolean; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section
      style={{
        background: "var(--bg-color)",
        border: "1px solid var(--border-color)",
        borderRadius: 6,
        marginBottom: 16,
        boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
        overflow: "hidden",
      }}
    >
      <header
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "var(--input-bg)",
          borderBottom: isOpen ? "1px solid var(--border-color)" : "1px solid transparent",
          cursor: "pointer",
          userSelect: "none",
          transition: "background 0.2s ease, border-color 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {Icon && <Icon size={16} color="var(--text-primary)" />}
          <h2
            style={{
              fontSize: 12,
              fontWeight: 600,
              margin: 0,
              color: "var(--text-primary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {title}
          </h2>
        </div>
        <ChevronDown
          size={16}
          color="var(--text-muted)"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </header>
      <div
        style={{
          display: "grid",
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          transition: "grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{ padding: "20px 16px" }}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
        borderBottom: "1px solid var(--border-color)",
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
    borderRadius: 4, // Industrial sharper corners
    cursor: "pointer",
    border: "1px solid var(--border-color)",
    transition: "all 0.2s ease",
  };
  if (variant === "primary") return { ...common, background: "var(--accent-color)", color: "#fff", border: "1px solid var(--accent-color)", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" };
  if (variant === "danger") return { ...common, background: "transparent", color: "#dc2626", borderColor: "#dc2626" };
  return { ...common, background: "var(--input-bg)", color: "var(--text-primary)" };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 12,
  borderRadius: 4,
  border: "1px solid var(--border-color)",
  background: "var(--bg-color)",
  color: "var(--text-primary)",
  outline: "none",
  fontFamily: "var(--font-mono, monospace)",
};

type MutationLike = {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
  variables?: unknown;
  submittedAt?: number;
};

function MutationState({ m, label }: { m: MutationLike; label?: string }) {
  if (m.isPending) {
    return (
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
        Saving{label ? ` ${label}` : ""}…
      </span>
    );
  }
  if (m.isError) {
    const msg = m.error instanceof Error ? m.error.message : String(m.error);
    return (
      <span
        style={{ fontSize: 11, color: "#dc2626", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={msg}
      >
        ✗ {msg}
      </span>
    );
  }
  if (m.isSuccess) {
    return <span style={{ fontSize: 11, color: "#16a34a" }}>✓ Saved</span>;
  }
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

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
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-color)",
          border: "1px solid var(--border-color)",
          borderRadius: 8,
          padding: 24,
          minWidth: 380,
          maxWidth: 520,
          width: "90%",
          boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</h3>
          <button onClick={onClose} style={{...btnStyle(), padding: "4px 8px"}}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function connectionTitle(connection: ComposioConnection) {
  return connection.alias || connection.account_label || connection.account_email || connection.account_name || connection.id || "Unnamed account";
}

// ── Connections (Composio-only) ───────────────────────────────────────────────

function ConnectionsSection({
  status,
  config,
  onChange,
}: {
  status: IntegrationsStatus["composio"];
  config: ComposioConfigPublic;
  onChange: () => void;
}) {
  const [toolkit, setToolkit] = useState("");
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<ComposioConnection | null>(null);
  const [alias, setAlias] = useState("");
  const [inspecting, setInspecting] = useState<{ slug: string; displayName: string } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState("");
  const [showGuideModal, setShowGuideModal] = useState(false);

  const toolsQuery = useQuery({
    queryKey: ["composio-tools", inspecting?.slug],
    queryFn: () => api.composioToolkitTools(inspecting!.slug),
    enabled: Boolean(inspecting),
  });

  const connect = useMutation({
    mutationFn: (tk: string) => api.composioConnect(tk),
    onSuccess: (data) => {
      if (data.redirect_url) window.open(data.redirect_url, "_blank");
      onChange();
    },
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => api.composioDisconnect(id),
    onSuccess: onChange,
  });
  const rename = useMutation({
    mutationFn: () => api.composioRenameConnection(renaming!.id!, alias.trim()),
    onSuccess: () => {
      setRenaming(null);
      setAlias("");
      onChange();
    },
  });
  const saveCfg = useMutation({
    mutationFn: () =>
      api.composioConfigSet({
        api_key: apiKey || undefined,
        user_id: userId || undefined,
      }),
    onSuccess: () => {
      setEditing(false);
      setApiKey("");
      setUserId("");
      onChange();
    },
  });
  const clearCfg = useMutation({
    mutationFn: () => api.composioConfigClear(),
    onSuccess: onChange,
  });
  const composioInvalidApiKey = /invalid api key/i.test(status.error || "");

  return (
    <Section title="External Connections" icon={LinkIcon} defaultOpen={true}>
      <Row>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontSize: 13 }}>Composio Integration</strong>
            <button 
              onClick={() => setShowGuideModal(true)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                color: "var(--text-muted)"
              }}
              title="What is Composio?"
            >
              <Info size={14} />
            </button>
            <StatusPill
              ok={composioInvalidApiKey ? false : status.configured}
              label={composioInvalidApiKey ? "invalid api key" : status.configured ? "configured" : "missing"}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>
            KEY ({config.api_key_source}): <span>{config.api_key_masked || "—"}</span>
            <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
            UID ({config.user_id_source}): <span>{config.user_id || "—"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={btnStyle()} onClick={() => setEditing(true)}>Configure</button>
          {(config.api_key_source === "db" || config.user_id_source === "db") && (
            <button style={btnStyle("danger")} onClick={() => clearCfg.mutate()} disabled={clearCfg.isPending}>
              Reset
            </button>
          )}
        </div>
      </Row>

      {showGuideModal && (
        <Modal title="Composio Guide" onClose={() => setShowGuideModal(false)}>
          <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>
            <p><strong>Composio</strong> is a powerful integration platform that allows this agent to securely connect to over 200+ third-party tools (like Gmail, GitHub, Notion, Slack, and more).</p>
            <hr style={{ border: "none", borderTop: "1px solid var(--border-color)", margin: "16px 0" }} />
            <h4 style={{ margin: "0 0 8px 0", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Setup Instructions</h4>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li>Sign up at <a href="https://composio.dev" target="_blank" rel="noreferrer" style={{color: "var(--accent-color)", textDecoration: "none"}}>composio.dev</a>.</li>
              <li>Navigate to <a href="https://platform.composio.dev/settings" target="_blank" rel="noreferrer" style={{color: "var(--accent-color)", textDecoration: "none"}}>platform.composio.dev/settings</a> to retrieve your <strong>Project API Key</strong>. <br/><span style={{ fontSize: 11, color: "var(--text-muted)" }}>(Note: Do not use the Sessions page key from the dashboard.)</span></li>
              <li>Click <strong>Configure</strong> in this panel and paste your API Key. Your User ID can be an email or any unique string.</li>
              <li>Once successfully configured, use the "Connect Other Toolkit" field below to start adding tools.</li>
            </ol>
          </div>
        </Modal>
      )}

      {status.configured && (
        <>
          {status.error && (
            <div style={{ background: "rgba(220,38,38,0.05)", borderLeft: "3px solid #dc2626", padding: "10px 14px", marginTop: 16, borderRadius: "0 4px 4px 0" }}>
              <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 500 }}>{status.error}</div>
              {composioInvalidApiKey && (
                <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4, opacity: 0.8 }}>
                  Action required: Retrieve a valid Project API key from platform.composio.dev/settings.
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            {status.toolkits.map((tk) => (
              <div
                key={tk.slug}
                style={{ 
                  border: "1px solid var(--border-color)", 
                  borderRadius: 6, 
                  background: "var(--bg-color)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
                }}
              >
                <div style={{ 
                  padding: "14px 16px", 
                  borderBottom: tk.connections.length > 0 ? "1px solid var(--border-color)" : "none",
                  display: "flex", 
                  justifyContent: "space-between", 
                  gap: 12, 
                  alignItems: "center",
                  background: "var(--input-bg)"
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 14 }}>{tk.display_name}</strong>
                      <StatusPill ok={tk.connections.length > 0} label={tk.connections.length > 0 ? `${tk.connections.length} active` : "inactive"} />
                      <StatusPill ok={tk.auth_mode !== "byo" || tk.has_auth_config} label={tk.auth_mode} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>
                      <span>{tk.slug}</span>
                      {tk.tool_count && <><span style={{ margin: "0 6px", opacity: 0.5 }}>|</span><span>{tk.tool_count} tools</span></>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={btnStyle()} onClick={() => setInspecting({ slug: tk.slug, displayName: tk.display_name })}>
                      Inspect
                    </button>
                    <button
                      style={btnStyle("primary")}
                      disabled={connect.isPending}
                      onClick={() => connect.mutate(tk.slug)}
                    >
                      Connect
                    </button>
                  </div>
                </div>
                
                {tk.auth_mode === "byo" && !tk.has_auth_config && (
                  <div style={{ padding: "8px 16px", fontSize: 11, color: "#dc2626", background: "rgba(220,38,38,0.05)" }}>
                    ⚠ Requires BYO auth config in the Composio dashboard before connecting.
                  </div>
                )}

                {tk.connections.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", padding: "0 16px" }}>
                    {tk.connections.map((connection, idx) => (
                      <div
                        key={connection.id || `${tk.slug}-${connection.account_email}`}
                        style={{ 
                          display: "flex", 
                          justifyContent: "space-between", 
                          gap: 12, 
                          alignItems: "center", 
                          padding: "12px 0",
                          borderBottom: idx !== tk.connections.length - 1 ? "1px solid var(--border-color)" : "none"
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <strong style={{ fontSize: 13 }}>{connectionTitle(connection)}</strong>
                            <StatusPill ok={connection.status === "ACTIVE" || connection.status === "active"} label={connection.status || "unknown"} />
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {connection.account_email || connection.account_name || connection.id || "Unknown identity"}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {connection.id && (
                            <button
                              style={btnStyle()}
                              onClick={() => {
                                setRenaming(connection);
                                setAlias(connection.alias || connection.account_label || "");
                              }}
                            >
                              Rename
                            </button>
                          )}
                          {connection.id && (
                            <button
                              style={btnStyle("danger")}
                              onClick={() => disconnect.mutate(connection.id!)}
                              disabled={disconnect.isPending}
                            >
                              Disconnect
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div style={{ 
              marginTop: 8, 
              padding: 16, 
              border: "1px dashed var(--border-color)", 
              borderRadius: 6,
              background: "rgba(0,0,0,0.01)" 
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12, letterSpacing: "0.05em" }}>
                PROVISION NEW TOOLKIT
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={toolkit}
                  onChange={(e) => setToolkit(e.target.value)}
                  placeholder="e.g. gmail, slack, zendesk"
                  list="composio-suggestions"
                  style={inputStyle}
                />
                <datalist id="composio-suggestions">
                  {COMPOSIO_SUGGESTED.map((s) => <option key={s} value={s} />)}
                </datalist>
                <button
                  style={btnStyle("primary")}
                  disabled={!toolkit.trim() || connect.isPending}
                  onClick={() => connect.mutate(toolkit.trim())}
                >
                  Provision
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {editing && (
        <Modal title="Composio Configuration" onClose={() => setEditing(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="API Key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Leave blank to keep existing"
                style={inputStyle}
              />
            </Field>
            <Field label="User Identity (ID)">
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder={config.user_id || "Leave blank to keep existing"}
                style={inputStyle}
              />
            </Field>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", marginTop: 8 }}>
              <MutationState m={saveCfg} />
              <button style={btnStyle()} onClick={() => setEditing(false)}>Cancel</button>
              <button
                style={btnStyle("primary")}
                disabled={(!apiKey && !userId) || saveCfg.isPending}
                onClick={() => saveCfg.mutate()}
              >
                {saveCfg.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {renaming && (
        <Modal title={`Rename Connection`} onClose={() => setRenaming(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: -8 }}>
              Editing alias for <strong>{connectionTitle(renaming)}</strong>
            </div>
            <Field label="Alias Name">
              <input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g., Work Gmail, Personal GitHub"
                style={inputStyle}
              />
            </Field>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", marginTop: 8 }}>
              <MutationState m={rename} />
              <button style={btnStyle()} onClick={() => setRenaming(null)}>Cancel</button>
              <button
                style={btnStyle("primary")}
                disabled={!alias.trim() || rename.isPending}
                onClick={() => rename.mutate()}
              >
                {rename.isPending ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {inspecting && (
        <Modal title={`${inspecting.displayName} Tools Registry`} onClose={() => setInspecting(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: "60vh", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: 6 }}>
            {toolsQuery.isLoading && <div style={{ padding: 16, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>Fetching tools registry…</div>}
            {toolsQuery.isError && (
              <div style={{ padding: 16, fontSize: 12, color: "#dc2626" }}>
                {String(toolsQuery.error)}
              </div>
            )}
            {toolsQuery.data?.tools?.map((tool: ComposioToolSummary, idx: number) => (
              <div key={tool.slug} style={{ 
                padding: "12px 16px", 
                borderBottom: idx !== toolsQuery.data.tools.length - 1 ? "1px solid var(--border-color)" : "none",
                background: idx % 2 === 0 ? "var(--bg-color)" : "var(--input-bg)"
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{tool.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                  <code style={{ background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: 4, width: "fit-content" }}>{tool.slug}</code>
                  {tool.description && <span style={{ lineHeight: 1.4 }}>{tool.description}</span>}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      <div style={{ marginTop: 12, display: "flex", gap: 12, fontSize: 11 }}>
        <MutationState m={connect} label="connect" />
        <MutationState m={disconnect} label="disconnect" />
        <MutationState m={rename} label="rename" />
        <MutationState m={clearCfg} label="reset" />
      </div>
    </Section>
  );
}

// ── Search configuration ───────────────────────────────────────────────────────

function SearchSection({ search, onChange }: { search: IntegrationsStatus["search"]; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");

  const save = useMutation({
    mutationFn: () => api.secretSet("tavily_api_key", apiKey),
    onSuccess: () => {
      setEditing(false);
      setApiKey("");
      onChange();
    },
  });
  const clear = useMutation({
    mutationFn: () => api.secretClear("tavily_api_key"),
    onSuccess: onChange,
  });

  return (
    <Section title="Search Backend" icon={Globe}>
      <Row>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontSize: 13 }}>Google Search Adapter</strong>
            <StatusPill ok={search.configured} label={search.configured ? "configured" : "missing"} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>
            PRV: <span>{search.provider}</span>
            <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
            KEY ({search.api_key_source}): <span>{search.api_key_masked || "—"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={btnStyle()} onClick={() => setEditing(true)}>Configure</button>
          {search.api_key_source === "db" && (
            <button style={btnStyle("danger")} onClick={() => clear.mutate()} disabled={clear.isPending}>
              Reset
            </button>
          )}
        </div>
      </Row>

      {editing && (
        <Modal title="Search Engine Configuration" onClose={() => setEditing(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="API Key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste new API key"
                style={inputStyle}
              />
            </Field>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Stored encrypted and isolated to the native search tool.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", marginTop: 8 }}>
              <MutationState m={save} />
              <button style={btnStyle()} onClick={() => setEditing(false)}>Cancel</button>
              <button
                style={btnStyle("primary")}
                disabled={!apiKey || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Committing…" : "Commit"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      <div style={{ marginTop: 8 }}>
        <MutationState m={clear} label="reset" />
      </div>
    </Section>
  );
}

function VoiceSection({ voice, onChange }: { voice: any; onChange: () => void }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (vals: any) => api.voiceSet(vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations-status"] });
      onChange();
    },
  });

  const clearMutation = useMutation({
    mutationFn: api.voiceClear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations-status"] });
      onChange();
    },
  });

  const [local, setLocal] = useState(voice.effective);

  const save = (patch: any) => {
    const next = { ...local, ...patch };
    setLocal(next);
    mutation.mutate(patch);
  };

  return (
    <Section title="Voice Configuration" icon={Mic} defaultOpen={false}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          Configure speech-to-text (STT) and text-to-speech (TTS) engines. 
          Settings are stored in {voice.effective.source === "db" ? "database" : "system defaults"}.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>STT Provider</label>
            <select 
              value={local.stt_provider} 
              onChange={(e) => save({ stt_provider: e.target.value })}
              style={inputStyle}
            >
              <option value="whisper_local">Whisper (Local CPU)</option>
              <option value="openai">OpenAI (API)</option>
              <option value="groq">Groq (Fast API)</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>STT Model</label>
            <input 
              type="text" 
              value={local.stt_model} 
              onChange={(e) => setLocal({ ...local, stt_model: e.target.value })}
              onBlur={(e) => save({ stt_model: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>TTS Provider</label>
            <select 
              value={local.tts_provider} 
              onChange={(e) => save({ tts_provider: e.target.value })}
              style={inputStyle}
            >
              <option value="browser_native">Browser Native</option>
              <option value="openai">OpenAI TTS</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="cartesia">Cartesia</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>TTS Voice</label>
            <input 
              type="text" 
              value={local.tts_voice} 
              onChange={(e) => setLocal({ ...local, tts_voice: e.target.value })}
              onBlur={(e) => save({ tts_voice: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input 
            type="checkbox" 
            checked={local.auto_submit} 
            onChange={(e) => save({ auto_submit: e.target.checked })}
          />
          <label style={{ margin: 0, fontWeight: 500, fontSize: 13, color: "var(--text-primary)" }}>Auto-submit after voice input</label>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>Voice Secrets</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {voice.secrets.map((s: any) => (
              <SecretRow key={s.name} secret={s} onChange={onChange} />
            ))}
          </div>
        </div>

        {voice.effective.source === "db" && (
          <button 
            style={btnStyle("danger")}
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
          >
            {clearMutation.isPending ? "Resetting…" : "Reset to Defaults"}
          </button>
        )}
      </div>
    </Section>
  );
}

// ── LLM model + provider keys (with editable secrets) ────────────────────────

function LLMSection({
  llm,
  onChange,
}: {
  llm: IntegrationsStatus["llm"];
  onChange: () => void;
}) {
  const [provider, setProvider] = useState(llm.effective.provider);
  const [model, setModel] = useState(llm.effective.model);
  const [temperature, setTemperature] = useState(String(llm.effective.temperature ?? 0.4));
  const [editingSecret, setEditingSecret] = useState<SecretStatus | null>(null);
  const [secretValue, setSecretValue] = useState("");

  const set = useMutation({
    mutationFn: () =>
      api.llmSet({
        provider,
        model,
        temperature: parseFloat(temperature) || 0,
      }),
    onSuccess: onChange,
  });
  const clear = useMutation({
    mutationFn: () => api.llmClear(),
    onSuccess: onChange,
  });
  const saveSecret = useMutation({
    mutationFn: () => api.secretSet(editingSecret!.name, secretValue),
    onSuccess: () => {
      setEditingSecret(null);
      setSecretValue("");
      onChange();
    },
  });
  const clearSecret = useMutation({
    mutationFn: (name: string) => api.secretClear(name),
    onSuccess: onChange,
  });

  const providers = Object.keys(llm.providers_configured);

  return (
    <Section title="Cognitive Engine (LLM)" icon={Bot}>
      <div style={{ 
        fontSize: 11, 
        color: "var(--text-muted)", 
        marginBottom: 20, 
        padding: "10px 14px", 
        background: "var(--input-bg)", 
        borderLeft: "3px solid var(--accent-color)", 
        borderRadius: "0 4px 4px 0",
        fontFamily: "var(--font-mono, monospace)"
      }}>
        <span style={{ color: "var(--text-primary)" }}>SRC: {llm.effective.source.toUpperCase()}</span> 
        <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
        MODEL: {llm.effective.provider}/{llm.effective.model}
        <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
        TEMP: {llm.effective.temperature}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 100px", gap: 16, alignItems: "end" }}>
        <Field label="Provider">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            style={inputStyle}
          >
            {providers.map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()} {llm.providers_configured[p] ? "" : "(MISSING KEY)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model Identifier">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. gemini-2.5-flash"
            style={inputStyle}
          />
        </Field>
        <Field label="Temp">
          <input
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            inputMode="decimal"
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
        <button style={btnStyle("primary")} onClick={() => set.mutate()} disabled={set.isPending}>
          {set.isPending ? "Applying…" : "Apply Override"}
        </button>
        <button style={btnStyle()} onClick={() => clear.mutate()} disabled={clear.isPending}>
          {clear.isPending ? "Reverting…" : "Revert to Default"}
        </button>
        <MutationState m={set} />
        <MutationState m={clear} />
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border-color)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
          <KeyRound size={12} /> SECRETS REGISTRY
        </div>
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border-color)", borderRadius: 6, overflow: "hidden" }}>
          {llm.secrets.map((s, idx) => (
            <div
              key={s.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: idx % 2 === 0 ? "var(--bg-color)" : "var(--input-bg)",
                borderBottom: idx !== llm.secrets.length - 1 ? "1px solid var(--border-color)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <strong style={{ fontSize: 12, fontFamily: "var(--font-mono, monospace)" }}>{s.name}</strong>
                <StatusPill
                  ok={s.source === "db" ? true : s.source === "env" ? true : false}
                  label={s.source === "db" ? "db" : s.source === "env" ? "env" : "unset"}
                />
                {s.masked && (
                  <code style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: 4 }}>{s.masked}</code>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={btnStyle()}
                  onClick={() => {
                    setEditingSecret(s);
                    setSecretValue("");
                  }}
                >
                  Edit
                </button>
                {s.db_set && (
                  <button
                    style={btnStyle("danger")}
                    onClick={() => clearSecret.mutate(s.name)}
                    disabled={clearSecret.isPending}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <MutationState m={clearSecret} label="clear" />
      </div>

      {editingSecret && (
        <Modal title={`Configure Secret: ${editingSecret.name}`} onClose={() => setEditingSecret(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Values are securely encrypted. Overrides environment variable <code>{editingSecret.env_var}</code>.
            </div>
            <Field label="Secret Value">
              <input
                type="password"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder="Paste key here"
                style={inputStyle}
                autoFocus
              />
            </Field>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", marginTop: 8 }}>
              <MutationState m={saveSecret} />
              <button style={btnStyle()} onClick={() => setEditingSecret(null)}>Cancel</button>
              <button
                style={btnStyle("primary")}
                disabled={!secretValue || saveSecret.isPending}
                onClick={() => saveSecret.mutate()}
              >
                {saveSecret.isPending ? "Committing…" : "Commit"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

// ── PyJIIT ────────────────────────────────────────────────────────────────────

function PyJIITSection({ pyjiit, onChange }: { pyjiit: PyJIITPublic; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.pyjiitSet({
        username: username || undefined,
        password: password || undefined,
      }),
    onSuccess: () => {
      setEditing(false);
      setUsername("");
      setPassword("");
      onChange();
    },
  });
  const clear = useMutation({
    mutationFn: () => api.pyjiitClear(),
    onSuccess: onChange,
  });

  return (
    <Section title="PyJIIT Integrations" icon={Database}>
      <Row>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontSize: 13 }}>J-Portal Authentication</strong>
            <StatusPill ok={pyjiit.configured} label={pyjiit.configured ? "configured" : "not set"} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>
            USER: <span>{pyjiit.username || "—"}</span>
            <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
            PASS: <span>{pyjiit.password_masked || "—"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={btnStyle()} onClick={() => setEditing(true)}>Configure</button>
          {pyjiit.configured && (
            <button style={btnStyle("danger")} onClick={() => clear.mutate()} disabled={clear.isPending}>
              Reset
            </button>
          )}
        </div>
      </Row>

      {editing && (
        <Modal title="PyJIIT Credentials" onClose={() => setEditing(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Enrolment Number / Username">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={pyjiit.username || "Leave blank to keep existing"}
                style={inputStyle}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to keep existing"
                style={inputStyle}
              />
            </Field>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", marginTop: 8 }}>
              <MutationState m={save} />
              <button style={btnStyle()} onClick={() => setEditing(false)}>Cancel</button>
              <button
                style={btnStyle("primary")}
                disabled={(!username && !password) || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Committing…" : "Commit"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      <div style={{ marginTop: 8 }}>
        <MutationState m={clear} label="reset" />
      </div>
    </Section>
  );
}

// ── Native tools / agents / infra (unchanged) ────────────────────────────────

function NativeToolsSection({ tools }: { tools: IntegrationsStatus["native_tools"] }) {
  return (
    <Section title="Native Tools Library" icon={Wrench}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 1 }}>
        {tools.map((t, idx) => (
          <div key={t.id} style={{ 
            display: "flex", justifyContent: "space-between", alignItems: "center", 
            padding: "10px 14px", 
            background: "var(--input-bg)",
            borderBottom: idx !== tools.length - 1 ? "1px solid var(--border-color)" : "none",
            borderRadius: tools.length === 1 ? 4 : idx === 0 ? "4px 4px 0 0" : idx === tools.length - 1 ? "0 0 4px 4px" : 0
          }}>
            <strong style={{ fontSize: 13, fontFamily: "var(--font-mono, monospace)" }}>{t.label}</strong>
            <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", background: "var(--bg-color)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border-color)" }}>{t.auth}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AgentsSection({ agents }: { agents: IntegrationsStatus["agents"] }) {
  return (
    <Section title="Registered Agents" icon={HardDrive}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 1 }}>
        {agents.map((a, idx) => (
          <div key={a.id} style={{ 
            display: "flex", justifyContent: "space-between", alignItems: "center", 
            padding: "10px 14px", 
            background: "var(--input-bg)",
            borderBottom: idx !== agents.length - 1 ? "1px solid var(--border-color)" : "none",
            borderRadius: agents.length === 1 ? 4 : idx === 0 ? "4px 4px 0 0" : idx === agents.length - 1 ? "0 0 4px 4px" : 0
          }}>
            <strong style={{ fontSize: 13 }}>{a.label}</strong>
            <code style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg-color)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border-color)" }}>{a.module}</code>
          </div>
        ))}
      </div>
    </Section>
  );
}

function InfraSection({ infra }: { infra: IntegrationsStatus["infra"] }) {
  return (
    <Section title="System Infrastructure" icon={Server}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 1 }}>
        {Object.entries(infra).map(([k, v], idx, arr) => (
          <div key={k} style={{ 
            display: "flex", justifyContent: "space-between", alignItems: "center", 
            padding: "10px 14px", 
            background: "var(--input-bg)",
            borderBottom: idx !== arr.length - 1 ? "1px solid var(--border-color)" : "none",
            borderRadius: arr.length === 1 ? 4 : idx === 0 ? "4px 4px 0 0" : idx === arr.length - 1 ? "0 0 4px 4px" : 0
          }}>
            <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>{k}</strong>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {v.error && (
                <span style={{ fontSize: 10, color: "#dc2626", maxWidth: 240, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                  {v.error}
                </span>
              )}
              <StatusPill ok={v.ok} label={v.ok ? "ONLINE" : "OFFLINE"} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function SettingsPanel() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["integrations-status"],
    queryFn: api.integrationsStatus,
    refetchInterval: 8000,
  });

  const onChange = () => qc.invalidateQueries({ queryKey: ["integrations-status"] });

  if (isLoading) {
    return (
      <div style={{ padding: 40, color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 16 }}>
        <Settings2 size={24} className="animate-spin" style={{ opacity: 0.5, animation: "spin 2s linear infinite" }} />
        <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>Initializing System...</span>
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div style={{ padding: 40, color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
        <Server size={32} />
        <span style={{ fontSize: 13, fontWeight: 500 }}>System Error</span>
        <div style={{ fontSize: 11, opacity: 0.8, fontFamily: "var(--font-mono, monospace)" }}>
          {String(error)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflow: "auto", padding: "30px 40px", height: "100%", background: "var(--bg-color)" }}>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <Settings2 size={20} color="var(--text-primary)" />
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-primary)" }}>
          System Configuration
        </h1>
      </div>
      
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <ConnectionsSection status={data.composio} config={data.composio_config} onChange={onChange} />
        <LLMSection llm={data.llm} onChange={onChange} />
        <SearchSection search={data.search} onChange={onChange} />
        <VoiceSection voice={data.voice} onChange={onChange} />
        <PyJIITSection pyjiit={data.pyjiit} onChange={onChange} />
        <NativeToolsSection tools={data.native_tools} />
        <AgentsSection agents={data.agents} />
        <InfraSection infra={data.infra} />
      </div>
    </div>
  );
}
