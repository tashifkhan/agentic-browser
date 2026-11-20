import { HardDrive, Server, Wrench } from "../../icons";
import { Pill } from "../../ui/Pill";
import type { IntegrationsStatus } from "../../types/api";
import { SettingsSection as Section } from "../components";
import { KeyList } from "../parts";

export function ServicesSection({ infra }: { infra: IntegrationsStatus["infra"] }) {
  const entries = Object.entries(infra);
  const down = entries.filter(([, v]) => !v.ok).length;
  return (
    <Section title="Services" icon={Server} aside={<Pill tone={down ? "err" : "ok"}>{down ? `${down} down` : "all online"}</Pill>}>
      <KeyList
        rows={entries.map(([k, v]) => ({
          key: k,
          label: <span className="ab-mono">{k}</span>,
          value: (
            <span className="set-inline">
              {v.error && <span className="set-note set-note--err" title={v.error}>{v.error}</span>}
              <Pill tone={v.ok ? "ok" : "err"}>{v.ok ? "online" : "offline"}</Pill>
            </span>
          ),
        }))}
      />
    </Section>
  );
}

export function ToolsSection({ tools }: { tools: IntegrationsStatus["native_tools"] }) {
  return (
    <Section title="Tools" icon={Wrench} description={`${tools.length} built in`}>
      <KeyList rows={tools.map((t) => ({ key: t.id, label: t.label, value: <span className="ab-mono set-muted">{t.auth}</span> }))} />
    </Section>
  );
}

export function AgentsSection({ agents }: { agents: IntegrationsStatus["agents"] }) {
  return (
    <Section title="Agents" icon={HardDrive} description={`${agents.length} registered`}>
      <KeyList rows={agents.map((a) => ({ key: a.id, label: a.label, value: <code className="set-muted">{a.module}</code> }))} />
    </Section>
  );
}
