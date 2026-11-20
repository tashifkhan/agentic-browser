import { Moon, Sun, Monitor, Github } from "@agentic-browser/shared/icons";
import { AppMark, Button, IconButton } from "@agentic-browser/shared/ui";
import "../frame.css";

function GoogleMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

/** A tiny page with a cursor working through it: what the agent does, shown rather than told. */
function AgentDemo() {
  return (
    <div className="demo" aria-hidden="true">
      <div className="demo__bar">
        <span /><span /><span />
        <div className="demo__url ab-mono">flights.example/search</div>
      </div>
      <div className="demo__page">
        <div className="demo__line demo__line--title" />
        <div className="demo__field demo__field--a"><span className="demo__typed ab-mono">SFO</span></div>
        <div className="demo__field demo__field--b"><span className="demo__typed demo__typed--b ab-mono">JFK, Friday</span></div>
        <div className="demo__btn">Search</div>
        <div className="demo__line" style={{ width: "70%" }} />
        <div className="demo__line" style={{ width: "52%" }} />
        <svg className="demo__cursor" width="16" height="18" viewBox="0 0 16 18">
          <path d="M1.5 1.5 14 7.2l-5.2 1.7 3.1 5.4-2.3 1.3-3.1-5.4L3 14.1 1.5 1.5Z" fill="var(--accent)" stroke="var(--bg)" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="demo__log ab-mono">
        <span className="demo__log-line demo__log-line--1"><i /> type "SFO" into From</span>
        <span className="demo__log-line demo__log-line--2"><i /> type "JFK" into To</span>
        <span className="demo__log-line demo__log-line--3"><i /> click Search</span>
      </div>
    </div>
  );
}

interface SignInScreenProps {
  onLogin: () => void;
  onGitHubLogin: () => void;
  theme?: "dark" | "light";
  themePreference?: "dark" | "light" | "system";
  onToggleTheme?: () => void;
}

export function SignInScreen({ onLogin, onGitHubLogin, theme = "dark", themePreference, onToggleTheme }: SignInScreenProps) {
  const pref = themePreference ?? theme;
  const ThemeIcon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  const nextLabel = pref === "dark" ? "light" : pref === "light" ? "system" : "dark";

  return (
    <div className="signin ab-dotgrid">
      <div className="signin__top">
        <span className="signin__brand">
          <AppMark size={26} />
          <span>Open DIA</span>
        </span>
        {onToggleTheme && (
          <IconButton size="sm" label={`Switch to ${nextLabel} theme`} onClick={onToggleTheme}>
            <ThemeIcon size={15} />
          </IconButton>
        )}
      </div>

      <div className="signin__body ab-stagger">
        <AgentDemo />

        <div>
          <h1 className="signin__headline">An agent that works in the tabs you already have open.</h1>
          <p className="signin__lede">
            Ask about the page you're on, hand it a multi-step task, or let your coding agent drive it over MCP.
            Bring your own model and keys.
          </p>
        </div>

        <ul className="signin__facts">
          <li><span className="ab-mono">01</span> Reads and summarises the current page, video or repo</li>
          <li><span className="ab-mono">02</span> Clicks, types and fills forms, and stops for logins and captchas</li>
          <li><span className="ab-mono">03</span> Remembers what matters across sessions, on your own machine</li>
        </ul>

        <div className="signin__actions">
          <Button variant="primary" size="lg" icon={<span className="signin__g"><GoogleMark size={14} /></span>} onClick={onLogin}>
            Continue with Google
          </Button>
          <Button size="lg" icon={<Github size={16} />} onClick={onGitHubLogin}>
            Continue with GitHub
          </Button>
        </div>

        <p className="signin__fine">
          Google sign-in also grants Gmail and Calendar access so the agent can read and draft mail and events.
          You can revoke it any time from your Google account.
        </p>
      </div>
    </div>
  );
}

export default SignInScreen;
