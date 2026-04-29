import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 0",
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
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em" }}>
        {label.toUpperCase()}
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
        background: "rgba(0,0,0,0.5)",
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

// ── OAuth integrations (now with Connect button via web flow) ────────────────

function OAuthSection({
  oauth,
  clients,
  onChange,
}: {
  oauth: OAuthConnection[];
  clients: OAuthClientStatus[];
  onChange: () => void;
}) {
  const disconnect = useMutation({
    mutationFn: (provider: string) => api.oauthDisconnect(provider),
    onSuccess: onChange,
  });

  const providers = ["google", "github"];
  const byProvider = Object.fromEntries(oauth.map((c) => [c.provider, c]));
  const clientByProvider = Object.fromEntries(clients.map((c) => [c.provider, c]));

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
                <StatusPill
                  ok={c ? c.status === "active" : false}
                  label={c ? c.status : "not connected"}
                />
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
                <a href={`/api/auth/${p}/start`} style={{ ...btnStyle("primary"), textDecoration: "none" }}>
                  Connect
                </a>
              )}
              {c && (
                <button
                  style={btnStyle("danger")}
                  onClick={() => disconnect.mutate(p)}
                  disabled={disconnect.isPending}
                >
                  Disconnect
                </button>
              )}
            </div>
          </Row>
        );
      })}
      <div style={{ marginTop: 8 }}>
        <MutationState m={disconnect} label="disconnect" />
      </div>
    </Section>
  );
}

// ── OAuth client setup (client_id / client_secret) ───────────────────────────

function OAuthClientsSection({ clients, onChange }: { clients: OAuthClientStatus[]; onChange: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.oauthClientSet(editing!, {
        client_id: clientId || undefined,
        client_secret: clientSecret || undefined,
      }),
    onSuccess: () => {
      setEditing(null);
      setClientId("");
      setClientSecret("");
      onChange();
    },
  });
  const clear = useMutation({
    mutationFn: (provider: string) => api.oauthClientClear(provider),
    onSuccess: onChange,
  });

  return (
    <Section title="OAuth client setup">
      {clients.map((c) => (
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
              <button style={btnStyle("danger")} onClick={() => clear.mutate(c.provider)} disabled={clear.isPending}>
                Reset
              </button>
            )}
          </div>
        </Row>
      ))}

      {editing && (
        <Modal title={`Edit ${editing} OAuth client`} onClose={() => setEditing(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Client ID">
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Leave blank to keep existing"
                style={inputStyle}
              />
            </Field>
            <Field label="Client secret">
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Leave blank to keep existing"
                style={inputStyle}
              />
            </Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              <MutationState m={save} />
              <button style={btnStyle()} onClick={() => setEditing(null)}>Cancel</button>
              <button
                style={btnStyle("primary")}
                disabled={(!clientId && !clientSecret) || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Saving…" : "Save"}
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

// ── Composio (toolkits + config) ─────────────────────────────────────────────

function ComposioSection({
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
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState("");

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

  return (
    <Section title="Composio">
      <Row>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontSize: 13 }}>Configuration</strong>
            <StatusPill ok={status.configured} label={status.configured ? "configured" : "missing"} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            api_key ({config.api_key_source}): <code>{config.api_key_masked || "—"}</code>
            {" · "}
            user_id ({config.user_id_source}): <code>{config.user_id || "—"}</code>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={btnStyle()} onClick={() => setEditing(true)}>Edit</button>
          {(config.api_key_source === "db" || config.user_id_source === "db") && (
            <button style={btnStyle("danger")} onClick={() => clearCfg.mutate()} disabled={clearCfg.isPending}>
              Reset
            </button>
          )}
        </div>
      </Row>

      {status.configured && (
        <>
          {status.error && (
            <div style={{ fontSize: 11, color: "#dc2626", marginTop: 10 }}>{status.error}</div>
          )}
          {status.connected.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "10px 0" }}>
              No connected toolkits.
            </div>
          )}
          {status.connected.map((c) => (
            <Row key={c.id || c.toolkit || Math.random()}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong style={{ fontSize: 13 }}>{c.toolkit || "(unknown)"}</strong>
                <StatusPill ok={c.status === "ACTIVE" || c.status === "active"} label={c.status || "?"} />
              </div>
              {c.id && (
                <button
                  style={btnStyle("danger")}
                  onClick={() => disconnect.mutate(c.id!)}
                  disabled={disconnect.isPending}
                >
                  Disconnect
                </button>
              )}
            </Row>
          ))}

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-color)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>
              CONNECT NEW TOOLKIT
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={toolkit}
                onChange={(e) => setToolkit(e.target.value)}
                placeholder="e.g. linkedin, gmail, github"
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
                Connect
              </button>
            </div>
          </div>
        </>
      )}

      {editing && (
        <Modal title="Composio configuration" onClose={() => setEditing(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="API key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Leave blank to keep existing"
                style={inputStyle}
              />
            </Field>
            <Field label="User ID">
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder={config.user_id || "Leave blank to keep existing"}
                style={inputStyle}
              />
            </Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
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
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        <MutationState m={connect} label="connect" />
        <MutationState m={disconnect} label="disconnect" />
        <MutationState m={clearCfg} label="reset" />
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
    <Section title="LLM model">
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>
        Source: <strong>{llm.effective.source}</strong> ·{" "}
        Effective: <code>{llm.effective.provider}/{llm.effective.model}</code> @ {llm.effective.temperature}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 100px", gap: 10, alignItems: "end" }}>
        <Field label="Provider">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            style={inputStyle}
          >
            {providers.map((p) => (
              <option key={p} value={p}>
                {p} {llm.providers_configured[p] ? "" : "(no key)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model">
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

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
        <button style={btnStyle("primary")} onClick={() => set.mutate()} disabled={set.isPending}>
          {set.isPending ? "Saving…" : "Save override"}
        </button>
        <button style={btnStyle()} onClick={() => clear.mutate()} disabled={clear.isPending}>
          {clear.isPending ? "Resetting…" : "Reset to .env default"}
        </button>
        <MutationState m={set} />
        <MutationState m={clear} />
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border-color)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>
          PROVIDER KEYS · click to edit
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {llm.secrets.map((s) => (
            <div
              key={s.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong style={{ fontSize: 12 }}>{s.name}</strong>
                <StatusPill
                  ok={s.source === "db" ? true : s.source === "env" ? true : false}
                  label={s.source === "db" ? "db" : s.source === "env" ? "env" : "unset"}
                />
                {s.masked && (
                  <code style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.masked}</code>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
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
                    Reset
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <MutationState m={clearSecret} label="reset" />
      </div>

      {editingSecret && (
        <Modal title={`Set ${editingSecret.name}`} onClose={() => setEditingSecret(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Stored encrypted. Overrides the <code>{editingSecret.env_var}</code> env var.
            </div>
            <Field label="Value">
              <input
                type="password"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder="Paste new value"
                style={inputStyle}
                autoFocus
              />
            </Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              <MutationState m={saveSecret} />
              <button style={btnStyle()} onClick={() => setEditingSecret(null)}>Cancel</button>
              <button
                style={btnStyle("primary")}
                disabled={!secretValue || saveSecret.isPending}
                onClick={() => saveSecret.mutate()}
              >
                {saveSecret.isPending ? "Saving…" : "Save"}
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
    <Section title="PyJIIT (J-Portal)">
      <Row>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontSize: 13 }}>Credentials</strong>
            <StatusPill ok={pyjiit.configured} label={pyjiit.configured ? "configured" : "not set"} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            username: <code>{pyjiit.username || "—"}</code>
            {" · "}
            password: <code>{pyjiit.password_masked || "—"}</code>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={btnStyle()} onClick={() => setEditing(true)}>Edit</button>
          {pyjiit.configured && (
            <button style={btnStyle("danger")} onClick={() => clear.mutate()} disabled={clear.isPending}>
              Reset
            </button>
          )}
        </div>
      </Row>

      {editing && (
        <Modal title="PyJIIT credentials" onClose={() => setEditing(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Enrolment number / username">
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
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              <MutationState m={save} />
              <button style={btnStyle()} onClick={() => setEditing(false)}>Cancel</button>
              <button
                style={btnStyle("primary")}
                disabled={(!username && !password) || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Saving…" : "Save"}
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
    <Section title="Native tools">
      {tools.map((t) => (
        <Row key={t.id}>
          <strong style={{ fontSize: 13 }}>{t.label}</strong>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.auth}</span>
        </Row>
      ))}
    </Section>
  );
}

function AgentsSection({ agents }: { agents: IntegrationsStatus["agents"] }) {
  return (
    <Section title="Registered agents">
      {agents.map((a) => (
        <Row key={a.id}>
          <strong style={{ fontSize: 13 }}>{a.label}</strong>
          <code style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.module}</code>
        </Row>
      ))}
    </Section>
  );
}

function InfraSection({ infra }: { infra: IntegrationsStatus["infra"] }) {
  return (
    <Section title="Infrastructure">
      {Object.entries(infra).map(([k, v]) => (
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
    return <div style={{ padding: 30, color: "var(--text-muted)" }}>Loading settings…</div>;
  }
  if (error || !data) {
    return (
      <div style={{ padding: 30, color: "#dc2626" }}>
        Failed to load integrations status: {String(error)}
      </div>
    );
  }

  return (
    <div style={{ overflow: "auto", padding: 30, height: "100%" }}>
      <OAuthSection oauth={data.oauth} clients={data.oauth_clients} onChange={onChange} />
      <OAuthClientsSection clients={data.oauth_clients} onChange={onChange} />
      <LLMSection llm={data.llm} onChange={onChange} />
      <ComposioSection status={data.composio} config={data.composio_config} onChange={onChange} />
      <PyJIITSection pyjiit={data.pyjiit} onChange={onChange} />
      <NativeToolsSection tools={data.native_tools} />
      <AgentsSection agents={data.agents} />
      <InfraSection infra={data.infra} />
    </div>
  );
}
