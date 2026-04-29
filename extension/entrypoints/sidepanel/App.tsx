import { useState, useEffect } from "react";
import "./App.css";
import { AgentExecutor } from "./AgentExecutor";
import { UnifiedSettingsMenu } from "./components/UnifiedSettingsMenu";
import { SignInScreen } from "./components/SignInScreen";
import { LoadingScreen } from "./components/LoadingScreen";
import { useAuth } from "./hooks/useAuth";
import { useTabManagement } from "./hooks/useTabManagement";
import { useWebSocket } from "./hooks/useWebSocket";
import { Sun, Moon, Monitor } from "lucide-react";

type ThemePreference = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

const getSystemTheme = (): ResolvedTheme =>
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-color-scheme: light)").matches
		? "light"
		: "dark";

const resolveTheme = (pref: ThemePreference): ResolvedTheme =>
	pref === "system" ? getSystemTheme() : pref;


const BACKEND_URL = (import.meta.env.VITE_API_URL || "http://localhost:5454").replace(/\/$/, "");

function App() {
	const {
		user,
		authLoading,
		tokenStatus,
		browserInfo,
		handleLogin,
		handleGitHubLogin,
		handleLogout,
		getTokenAge,
		getTokenExpiry,
		handleManualRefresh,
		shouldRedirectToSettings,
		resetRedirect,
	} = useAuth();

	// Tab management
	const { activeTab } = useTabManagement();

	// State
	const [apiKey, setApiKey] = useState("");
	const [response, setResponse] = useState("");
	const [showToken, setShowToken] = useState(false);
	const [showRefreshToken, setShowRefreshToken] = useState(false);
	const [conversationStats, setConversationStats] = useState<any>({
		total_interactions: 0,
		successful_interactions: 0,
		current_session_length: 0,
	});
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
		if (typeof window === "undefined") return "dark";
		const saved = localStorage.getItem("theme");
		return saved === "light" || saved === "system" ? saved : "dark";
	});
	const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
		resolveTheme(
			(typeof window !== "undefined" &&
				(localStorage.getItem("theme") as ThemePreference)) || "dark"
		)
	);

	useEffect(() => {
		const next = resolveTheme(themePreference);
		setResolvedTheme(next);
		document.documentElement.setAttribute("data-theme", next);
		localStorage.setItem("theme", themePreference);

		if (themePreference !== "system") return;
		const mql = window.matchMedia("(prefers-color-scheme: light)");
		const onChange = () => {
			const sysTheme: ResolvedTheme = mql.matches ? "light" : "dark";
			setResolvedTheme(sysTheme);
			document.documentElement.setAttribute("data-theme", sysTheme);
		};
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, [themePreference]);

	const cycleTheme = () => {
		setThemePreference((prev) =>
			prev === "dark" ? "light" : prev === "light" ? "system" : "dark"
		);
	};

	const themeIcon =
		themePreference === "dark" ? (
			<Moon size={18} />
		) : themePreference === "light" ? (
			<Sun size={18} />
		) : (
			<Monitor size={18} />
		);

	const themeLabel =
		themePreference === "dark"
			? "Dark mode (click for light)"
			: themePreference === "light"
				? "Light mode (click for system)"
				: "System mode (click for dark)";


	// WebSocket
	const { wsConnected, useWebSocket: useWS } = useWebSocket(setResponse);
	useEffect(() => {
		if (shouldRedirectToSettings) {
			setIsSettingsOpen(true);
			resetRedirect();
		}
	}, [shouldRedirectToSettings, resetRedirect]);
	useEffect(() => {
		loadApiKey();
		loadConversationStats();

		const activateFrame = async () => {
			try {
				const [tab] = await browser.tabs.query({
					active: true,
					currentWindow: true,
				});
				if (tab.id) {
					await browser.runtime.sendMessage({
						type: "ACTIVATE_AI_FRAME",
						tabId: tab.id,
					});
					console.log("AI frame activation requested from sidepanel");
				}
			} catch (error) {
				console.log("Could not activate AI frame:", error);
			}
		};

		activateFrame();

		const handleStorageChange = (
			changes: Record<string, Browser.storage.StorageChange>,
			areaName: string
		) => {
			if (areaName !== "local") return;
			if (typeof changes.geminiApiKey?.newValue === "string") {
				setApiKey(changes.geminiApiKey.newValue);
			}
		};

		browser.storage.onChanged.addListener(handleStorageChange);

		return () => {
			browser.storage.onChanged.removeListener(handleStorageChange);
			browser.tabs
				.query({ active: true, currentWindow: true })
				.then(([tab]: any[]) => {
					if (tab.id) {
						browser.runtime
							.sendMessage({
								type: "DEACTIVATE_AI_FRAME",
								tabId: tab.id,
							})
							.catch(() => { });
					}
				});
		};
	}, []);

	const loadApiKey = async () => {
		const result = await browser.storage.local.get("geminiApiKey");
		if (typeof result.geminiApiKey === "string") {
			setApiKey(result.geminiApiKey);
		}
	};

	const saveApiKey = async () => {
		await browser.storage.local.set({ geminiApiKey: apiKey });
		setResponse("API Key saved!");
	};

	const loadConversationStats = async () => {
		try {
			if (useWS && wsConnected) {
				const data = await import("../utils/websocket-client").then((m) =>
					m.wsClient.getStats()
				);
				if (data.ok) {
					setConversationStats(data.stats);
				}
			} else {
				// Backend currently does not expose conversation-stats;
				// do a lightweight health call and keep default stats.
				await fetch(`${BACKEND_URL}/api/genai/health/`);
			}
		} catch (error) {
			console.error("Failed to load conversation stats:", error);
			// Set default values on error
			setConversationStats({
				total_interactions: 0,
				successful_interactions: 0,
				current_session_length: 0,
			});
			if (useWS) {
				try {
					await fetch(`${BACKEND_URL}/api/genai/health/`);
				} catch (httpError) {
					console.error("HTTP fallback also failed:", httpError);
				}
			}
		}
	};

	if (authLoading) {
		return <LoadingScreen />;
	}

	if (!user) {
		return (
			<SignInScreen
				onLogin={handleLogin}
				onGitHubLogin={handleGitHubLogin}
				theme={resolvedTheme}
				themePreference={themePreference}
				onToggleTheme={cycleTheme}
			/>
		);
	}


	return (
		<div className="app">
			<header>
				<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
					<img src="/app_icon.jpg" alt="Icon" className="header-icon" />
					<h1 style={{
						color: resolvedTheme === 'light' ? '#000000' : '#ffffff',
						margin: 0,
						fontSize: '20px',
						fontWeight: 800,
						letterSpacing: '-0.5px'
					}}>Open DIA</h1>
				</div>
				<button className="theme-toggle" onClick={cycleTheme} title={themeLabel} aria-label={themeLabel}>
					{themeIcon}
				</button>
			</header>


			<AgentExecutor wsConnected={wsConnected} />

			<UnifiedSettingsMenu
				user={user}
				showToken={showToken}
				setShowToken={setShowToken}
				showRefreshToken={showRefreshToken}
				setShowRefreshToken={setShowRefreshToken}
				tokenStatus={tokenStatus}
				browserInfo={browserInfo}
				handleManualRefresh={handleManualRefresh}
				handleLogout={handleLogout}
				getTokenAge={getTokenAge}
				getTokenExpiry={getTokenExpiry}
				apiKey={apiKey}
				setApiKey={setApiKey}
				onSaveApiKey={saveApiKey}
				wsConnected={wsConnected}
				themePreference={themePreference}
				onThemeChange={setThemePreference}
				position={{ bottom: "110px", right: "8px" }}
				isOpen={isSettingsOpen}
				onToggle={() => setIsSettingsOpen(!isSettingsOpen)}
			/>
		</div>
	);
}

export default App;
