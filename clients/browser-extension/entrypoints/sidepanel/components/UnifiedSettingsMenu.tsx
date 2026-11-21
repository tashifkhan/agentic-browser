import { useEffect } from "react";
import { LogOut, Monitor, Moon, Palette, Sun, X } from "@agentic-browser/shared/icons";
import { Button, IconButton, Segmented } from "@agentic-browser/shared/ui";
import { ApiProvider } from "@agentic-browser/shared/query";
import { BackendSettings, type SettingsSectionId } from "@agentic-browser/shared/settings-ui";
import { BridgeSection } from "./BridgeSection";
import "../frame.css";

type ThemePreference = "light" | "dark" | "system";

const getBase = () => localStorage.getItem("baseUrl") || "http://localhost:5454";

// Backend sections shown in the side panel, in order.
const SECTIONS: SettingsSectionId[] = ["model", "subscriptions", "apps", "voice", "search", "memory", "telegram", "jiit", "services", "tools", "agents"];

function ThemeCard({ theme, onChange }: { theme: ThemePreference; onChange: (t: ThemePreference) => void }) {
  return (
    <div className="ab-card sheet__theme">
      <span className="sheet__theme-label">
        <Palette size={15} /> Theme
      </span>
      <Segmented<ThemePreference>
        label="Theme"
        value={theme}
        onChange={onChange}
        options={[
          { value: "light", label: "Light", icon: <Sun size={13} /> },
          { value: "dark", label: "Dark", icon: <Moon size={13} /> },
          { value: "system", label: "System", icon: <Monitor size={13} /> },
        ]}
      />
    </div>
  );
}

function AccountCard({ user, onSignOut }: { user: any; onSignOut: () => void }) {
  const name: string = user?.name || user?.email || "Signed in";
  return (
    <div className="ab-card sheet__account">
      <div className="sheet__avatar">{user?.picture ? <img src={user.picture} alt="" /> : name.trim().charAt(0).toUpperCase() || "?"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sheet__account-name">{name}</div>
        {user?.email && user?.name && <div className="sheet__account-email">{user.email}</div>}
      </div>
      <Button size="sm" variant="danger" icon={<LogOut size={13} />} onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  );
}

/**
 * Settings sheet over the side panel. Theme and the MCP bridge work without
 * the backend; everything under "Backend" comes from the shared settings
 * library and degrades to a retryable error when the API is down.
 */
export function UnifiedSettingsMenu({ isOpen, onToggle, handleLogout, themePreference, onThemeChange, user }: any) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[role=dialog][aria-modal=true]:not(.sheet)") && onToggle();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onToggle]);

  if (!isOpen) return null;

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="sheet__head">
        <div className="sheet__title">
          <h1>Settings</h1>
        </div>
        <IconButton label="Close settings (Esc)" onClick={onToggle}>
          <X size={17} />
        </IconButton>
      </div>

      <div className="sheet__body">
        <AccountCard user={user} onSignOut={handleLogout} />

        <div className="sheet__group">
          <span className="ab-eyebrow">This browser</span>
          <ThemeCard theme={themePreference} onChange={onThemeChange} />
          <BridgeSection />
        </div>

        <div className="sheet__group">
          <span className="ab-eyebrow">Backend</span>
          <ApiProvider baseUrl={getBase()}>
            <div className="sheet__backend">
              <BackendSettings
                sections={SECTIONS}
                errorHint="Model, keys and connected apps live there. The MCP bridge and theme above work without it."
              />
            </div>
          </ApiProvider>
        </div>
      </div>
    </div>
  );
}

export default UnifiedSettingsMenu;
