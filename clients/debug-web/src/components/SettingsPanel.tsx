import { BackendSettings, SETTINGS_SECTION_LABELS, type SettingsSectionId } from "@agentic-browser/shared/settings-ui";
import "./settings.css";

// Order of sections on the console's settings page.
const SECTIONS: SettingsSectionId[] = ["model", "apps", "voice", "search", "mcp", "jiit", "telegram", "services", "tools", "agents"];

export function SettingsPanel() {
  return (
    <div className="settings-page">
      <nav className="settings-page__index" aria-label="Settings sections">
        <span className="ab-eyebrow">On this page</span>
        {SECTIONS.map((id) => (
          <a
            key={id}
            href={`#set-${id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            {SETTINGS_SECTION_LABELS[id]}
          </a>
        ))}
      </nav>
      <div className="settings-page__col">
        <BackendSettings
          sections={SECTIONS}
          open={["model", "apps"]}
          errorHint={
            <>
              Start the stores with <code className="ab-mono">docker compose up -d</code> and the API with{" "}
              <code className="ab-mono">uv run agentic-api-run</code>.
            </>
          }
        />
      </div>
    </div>
  );
}
