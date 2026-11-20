import type { ReactNode } from "react";
import { useIntegrations } from "../query/hooks";
import { QueryView } from "../ui/QueryView";
import { Skeleton } from "../ui/Skeleton";
import type { IntegrationsStatus } from "../types/api";
import { ConnectionsSection } from "./sections/ConnectionsSection";
import { AgentsSection, ServicesSection, ToolsSection } from "./sections/ListSections";
import { MemorySection } from "./sections/MemorySection";
import { ModelSection } from "./sections/ModelSection";
import { PyJIITSection } from "./sections/PyJIITSection";
import { SearchSection } from "./sections/SearchSection";
import { TelegramSection } from "./sections/TelegramSection";
import { VoiceSection } from "./sections/VoiceSection";
import "./settings.css";

export type SettingsSectionId = "model" | "apps" | "voice" | "search" | "memory" | "jiit" | "telegram" | "services" | "tools" | "agents";

export const SETTINGS_SECTION_LABELS: Record<SettingsSectionId, string> = {
  model: "Model",
  apps: "Connected apps",
  voice: "Voice",
  search: "Web search",
  memory: "Memory",
  jiit: "JIIT portal",
  telegram: "Telegram bot",
  services: "Services",
  tools: "Tools",
  agents: "Agents",
};

const ALL: SettingsSectionId[] = ["model", "apps", "voice", "search", "jiit", "telegram", "services", "tools", "agents"];

function render(id: SettingsSectionId, d: IntegrationsStatus, open: boolean): ReactNode {
  switch (id) {
    case "model": return d.llm && <ModelSection llm={d.llm} defaultOpen={open} />;
    case "apps": return d.composio && <ConnectionsSection status={d.composio} config={d.composio_config} defaultOpen={open} />;
    case "voice": return d.voice && <VoiceSection voice={d.voice} />;
    case "search": return d.search && <SearchSection search={d.search} />;
    case "memory": return <MemorySection />;
    case "jiit": return d.pyjiit && <PyJIITSection pyjiit={d.pyjiit} />;
    case "telegram": return d.telegram && <TelegramSection telegram={d.telegram} />;
    case "services": return d.infra && <ServicesSection infra={d.infra} />;
    case "tools": return d.native_tools && <ToolsSection tools={d.native_tools} />;
    case "agents": return d.agents && <AgentsSection agents={d.agents} />;
  }
}

/**
 * Every setting that lives in the backend, from one integrations query.
 * Loading shows skeleton sections; a failed request shows a retryable error.
 * Must sit inside <ApiProvider>.
 */
export function BackendSettings({
  sections = ALL,
  open = [],
  errorHint,
}: {
  sections?: SettingsSectionId[];
  open?: SettingsSectionId[];
  errorHint?: ReactNode;
}) {
  const query = useIntegrations();
  return (
    <QueryView
      query={query}
      isEmpty={() => false}
      errorHint={errorHint}
      skeleton={
        <div className="set-skeletons ab-stagger">
          {sections.slice(0, 5).map((s) => (
            <div key={s} className="ab-card set-skeleton">
              <Skeleton width={30} height={30} style={{ borderRadius: "var(--r-2)" }} />
              <div>
                <Skeleton width="30%" height={10} />
                <Skeleton width="55%" height={8} />
              </div>
            </div>
          ))}
        </div>
      }
    >
      {(d) => (
        <div className="ab-stagger">
          {sections.map((id) => (
            <div key={id} id={`set-${id}`} className="set-anchor">
              {render(id, d, open.includes(id))}
            </div>
          ))}
        </div>
      )}
    </QueryView>
  );
}
