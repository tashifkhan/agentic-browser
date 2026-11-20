import { useEffect, useState, type CSSProperties } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Brain,
  LayoutGrid,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Stethoscope,
  Sun,
  type IconType,
} from "@agentic-browser/shared/icons";
import { AppMark } from "@agentic-browser/shared/ui";
import { useStats } from "@agentic-browser/shared/query";

type NavItem = {
  id: "dashboard" | "chat" | "runs" | "memory" | "maintenance" | "settings";
  label: string;
  path: string;
  group: "Operate" | "Inspect" | "Configure";
  Icon: IconType;
  contentStyle?: CSSProperties;
};

export const NAV: NavItem[] = [
  { id: "chat", label: "Chat", path: "/chat", group: "Operate", Icon: MessageSquare, contentStyle: { padding: 0, overflow: "hidden" } },
  { id: "runs", label: "Agent runs", path: "/runs", group: "Operate", Icon: Activity },
  { id: "dashboard", label: "Overview", path: "/dashboard", group: "Inspect", Icon: LayoutGrid, contentStyle: { padding: "24px 28px", overflow: "auto" } },
  { id: "memory", label: "Memory", path: "/memory", group: "Inspect", Icon: Brain },
  { id: "maintenance", label: "Diagnostics", path: "/diagnostics", group: "Inspect", Icon: Stethoscope },
  { id: "settings", label: "Settings", path: "/settings", group: "Configure", Icon: Settings2, contentStyle: { padding: 0, overflow: "hidden" } },
];

const GROUPS: NavItem["group"][] = ["Operate", "Inspect", "Configure"];

function matchesNavPath(pathname: string, itemPath: string) {
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [theme, setTheme] = useEffectTheme();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("nav-collapsed") === "1");

  const statsQuery = useStats();
  const stats = statsQuery.data;
  const online = statsQuery.isSuccess;
  // A thrown fetch means nothing is listening; an HTTP error means the API is up but failing.
  const errText = statsQuery.error instanceof Error ? statsQuery.error.message : "";
  const unreachable = statsQuery.isError && !/\b\d{3}\b/.test(errText);
  const degraded = statsQuery.isError && !unreachable;

  const currentNav = NAV.find((item) => matchesNavPath(pathname, item.path)) ?? NAV[0];

  useEffect(() => {
    localStorage.setItem("nav-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // Alt+1..6 jumps between sections; Alt+\ folds the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.code === "Backslash") {
        e.preventDefault();
        setCollapsed((c) => !c);
        return;
      }
      const n = Number(e.code.replace("Digit", ""));
      if (n >= 1 && n <= NAV.length) {
        e.preventDefault();
        navigate({ to: NAV[n - 1].path });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className={`shell${collapsed ? " shell--collapsed" : ""}`}>
      <nav className="shell__nav" aria-label="Main">
        <div className="shell__brand">
          <AppMark size={30} />
          <div className="shell__brand-text">
            <span className="shell__brand-name">Agentic Browser</span>
            <span className="ab-eyebrow" style={{ fontSize: 9.5 }}>Console</span>
          </div>
        </div>

        <div className="shell__groups">
          {GROUPS.map((group) => (
            <div key={group} className="shell__group">
              <div className="shell__group-label ab-eyebrow">{group}</div>
              {NAV.filter((i) => i.group === group).map((item) => {
                const active = matchesNavPath(pathname, item.path);
                const running = item.id === "runs" ? stats?.runs.running ?? 0 : 0;
                const index = NAV.indexOf(item) + 1;
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    className={`shell__link${active ? " is-active" : ""}`}
                    title={collapsed ? `${item.label} (Alt+${index})` : undefined}
                    aria-current={active ? "page" : undefined}
                  >
                    <item.Icon size={16} strokeWidth={1.8} />
                    <span className="shell__link-label">{item.label}</span>
                    {running > 0 ? (
                      <span className="ab-pill ab-pill--live shell__link-badge">{running}</span>
                    ) : (
                      <span className="ab-kbd shell__link-kbd">⌥{index}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="shell__foot">
          <div className="shell__status">
            <span
              className={`ab-pill ${online ? "ab-pill--ok" : degraded ? "ab-pill--warn" : unreachable ? "ab-pill--err" : ""}`}
              title={errText || undefined}
            >
              {online ? "backend online" : degraded ? "backend degraded" : unreachable ? "backend offline" : "connecting"}
            </span>
            <span className="ab-mono shell__status-url">localhost:5454</span>
          </div>
          <div className="shell__foot-row">
            <div className="seg" role="radiogroup" aria-label="Theme">
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={theme === t}
                  className={`seg__item${theme === t ? " is-on" : ""}`}
                  onClick={() => setTheme(t)}
                  title={`${t === "light" ? "Light" : "Dark"} theme`}
                >
                  {t === "light" ? <Sun size={13} /> : <Moon size={13} />}
                  <span className="shell__link-label">{t === "light" ? "Light" : "Dark"}</span>
                </button>
              ))}
            </div>
            <button
              className="ab-btn ab-btn--ghost ab-btn--icon ab-btn--sm"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "Expand sidebar (Alt+\\)" : "Collapse sidebar (Alt+\\)"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
          </div>
        </div>
      </nav>

      <main className="shell__main">
        <header className="shell__top">
          <div className="shell__title">
            <h1>{currentNav.label}</h1>
          </div>
          {stats && (
            <dl className="telemetry">
              <div>
                <dt className="ab-eyebrow">Runs</dt>
                <dd className="ab-mono">{stats.runs.total.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="ab-eyebrow">Live</dt>
                <dd className="ab-mono" style={{ color: stats.runs.running ? "var(--accent)" : undefined }}>
                  {stats.runs.running}
                </dd>
              </div>
              <div>
                <dt className="ab-eyebrow">Memories</dt>
                <dd className="ab-mono">{stats.memory.total_active.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="ab-eyebrow">Sources</dt>
                <dd className="ab-mono">{stats.memory.sources.toLocaleString()}</dd>
              </div>
            </dl>
          )}
        </header>

        <div className="shell__content" style={currentNav.contentStyle}>
          <div key={currentNav.id} className="ab-fade" style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

function useEffectTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(
    (document.documentElement.getAttribute("data-theme") as "light" | "dark" | null) ?? "dark"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return [theme, setTheme] as const;
}
