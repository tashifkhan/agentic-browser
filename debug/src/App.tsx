import { useEffect, useState, type CSSProperties, type FC, type SVGProps } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api";

type NavItem = {
  id: "dashboard" | "runs" | "memory" | "maintenance" | "settings";
  label: string;
  path: string;
  Icon: FC<SVGProps<SVGSVGElement>>;
  contentStyle?: CSSProperties;
};

const Icons = {
  Dashboard: (props: SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  Runs: (props: SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  Memory: (props: SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  Maintenance: (props: SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  Sun: (props: SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  ),
  Moon: (props: SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  ),
  Settings: (props: SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

export const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", Icon: Icons.Dashboard, contentStyle: { padding: 30, overflow: "auto" } },
  { id: "runs", label: "Agent Runs", path: "/runs", Icon: Icons.Runs },
  { id: "memory", label: "Memory Bank", path: "/memory", Icon: Icons.Memory },
  { id: "maintenance", label: "Diagnostics", path: "/diagnostics", Icon: Icons.Maintenance },
  { id: "settings", label: "Settings", path: "/settings", Icon: Icons.Settings, contentStyle: { padding: 0, overflow: "hidden" } },
];

function matchesNavPath(pathname: string, itemPath: string) {
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [theme, setTheme] = useEffectTheme();

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: api.stats,
    refetchInterval: 4000,
  });

  const currentNav = NAV.find((item) => matchesNavPath(pathname, item.path)) ?? NAV[0];

  return (
    <div
      className="fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 24px",
          height: 56,
          borderBottom: "1px solid var(--border-color)",
          background: "var(--header-bg)",
          flexShrink: 0,
          position: "relative",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "var(--input-bg)",
              border: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 600,
              color: "var(--accent-color)",
              flexShrink: 0,
            }}
          >
            A
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
              }}
            >
              Agentic Browser
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                lineHeight: 1,
                marginTop: 2,
              }}
            >
              System Debugger
            </span>
          </div>
        </div>

        {stats && (
          <div
            style={{
              display: "flex",
              gap: 20,
              paddingLeft: 10,
              marginLeft: "auto",
            }}
          >
            {[
              { label: "Runs", value: stats.runs.total },
              { label: "Mem", value: stats.memory.total_active },
              { label: "Srcs", value: stats.memory.sources },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                  {s.label}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {s.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ width: 1, height: 20, background: "var(--border-color)", margin: "0 8px" }} />

        <button
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          style={{
            padding: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            color: "var(--text-secondary)",
            background: "var(--input-bg)",
            border: "1px solid var(--border-color)",
          }}
          title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? <Icons.Moon /> : <Icons.Sun />}
        </button>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <nav
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: "1px solid var(--border-color)",
            background: "var(--bg-color)",
            display: "flex",
            flexDirection: "column",
            padding: "16px 12px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {NAV.map((item) => {
              const active = matchesNavPath(pathname, item.path);
              const hasAlert = item.id === "runs" && (stats?.runs.running ?? 0) > 0;
              const Icon = item.Icon;

              return (
                <Link
                  key={item.id}
                  to={item.path}
                  style={{ textDecoration: "none" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      background: active ? "var(--button-bg)" : "transparent",
                      border: "1px solid",
                      borderColor: active ? "var(--border-color)" : "transparent",
                      color: active ? "var(--accent-color)" : "var(--text-secondary)",
                      textAlign: "left",
                      fontWeight: active ? 500 : 400,
                      width: "100%",
                      borderRadius: 8,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        color: active ? "var(--accent-color)" : "var(--text-muted)",
                      }}
                    >
                      <Icon />
                    </span>
                    <span style={{ fontSize: 13 }}>{item.label}</span>

                    {hasAlert && (
                      <span
                        style={{
                          marginLeft: "auto",
                          background: "var(--status-connected-bg)",
                          color: "var(--status-connected-text)",
                          border: "1px solid var(--status-connected-text)",
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 12,
                        }}
                      >
                        {stats?.runs.running ?? 0}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <div style={{ marginTop: "auto" }}>
            <div
              style={{
                padding: "12px",
                borderRadius: 8,
                background: "var(--input-bg)",
                border: "1px solid var(--border-color)",
              }}
            >
              <div className="section-label" style={{ marginBottom: 6 }}>
                Target API
              </div>
              <div
                className="mono"
                style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}
              >
                :5454/api/debug
              </div>
            </div>
          </div>
        </nav>

        <main
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            background: "var(--section-bg)",
          }}
        >
          <div
            style={{
              padding: "20px 30px",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexShrink: 0,
              background: "var(--bg-color)",
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              {currentNav.label}
            </span>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              ...currentNav.contentStyle,
            }}
          >
            <div className="fade-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <Outlet />
            </div>
          </div>
        </main>
      </div>
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
