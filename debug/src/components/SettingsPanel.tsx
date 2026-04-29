import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type IntegrationsStatus,
  type LLMEffective,
  type OAuthConnection,
} from "../lib/api";

const COMPOSIO_SUGGESTED = ["linkedin", "gmail", "google_calendar", "github", "notion", "slack"];

function StatusPill({
  ok,
  label,
}: {
  ok: boolean | null;
  label: string;
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

function OAuthSection({ oauth, onChange }: { oauth: OAuthConnection[]; onChange: () => void }) {
  const disconnect = useMutation({
    mutationFn: (provider: string) => api.oauthDisconnect(provider),
    onSuccess: onChange,
  });

  const providers = ["google", "github"];
  const byProvider = Object.fromEntries(oauth.map((c) => [c.provider, c]));

  return (
    <Section title="OAuth integrations">
      {providers.map((p) => {
        const c = byProvider[p];
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
              {!c && (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Sign in via the browser extension to connect.
                </div>
              )}
            </div>
            {c && (
              <button
                style={btnStyle("danger")}
                onClick={() => disconnect.mutate(p)}
                disabled={disconnect.isPending}
              >
                Disconnect
              </button>
            )}
          </Row>
        );
      })}
    </Section>
  );
}

function ComposioSection({ status, onChange }: { status: IntegrationsStatus["composio"]; onChange: () => void }) {
  const [toolkit, setToolkit] = useState("");
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

  if (!status.configured) {
    return (
      <Section title="Composio">
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Composio is not configured. Set <code>COMPOSIO_API_KEY</code> and <code>COMPOSIO_USER_ID</code> in your environment.
        </div>
      </Section>
    );
  }

  return (
    <Section title="Composio toolkits">
      {status.error && (
        <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 10 }}>{status.error}</div>
      )}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
        User ID: <code>{status.user_id}</code>
      </div>
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
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--input-bg)",
              color: "var(--text-primary)",
            }}
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
    </Section>
  );
}

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
    onSuccess: () => {
      onChange();
    },
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

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button style={btnStyle("primary")} onClick={() => set.mutate()} disabled={set.isPending}>
          Save override
        </button>
        <button style={btnStyle()} onClick={() => clear.mutate()} disabled={clear.isPending}>
          Reset to .env default
        </button>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border-color)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>
          PROVIDER KEYS (.env)
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(llm.providers_configured).map(([p, ok]) => (
            <StatusPill key={p} ok={ok} label={p} />
          ))}
        </div>
      </div>
    </Section>
  );
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
      <OAuthSection oauth={data.oauth} onChange={onChange} />
      <LLMSection llm={data.llm} onChange={onChange} />
      <ComposioSection status={data.composio} onChange={onChange} />
      <NativeToolsSection tools={data.native_tools} />
      <AgentsSection agents={data.agents} />
      <InfraSection infra={data.infra} />
    </div>
  );
}
