import { useState, useEffect } from "react";
import "./App.css";
import { AgentExecutor } from "./AgentExecutor";
import { UnifiedSettingsMenu } from "./components/UnifiedSettingsMenu";
import { SignInScreen } from "./components/SignInScreen";
import { LoadingScreen } from "./components/LoadingScreen";
import { useAuth } from "./hooks/useAuth";
import { useTabManagement } from "./hooks/useTabManagement";
import { useWebSocket } from "./hooks/useWebSocket";

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


			<AgentExecutor wsConnected={wsConnected} onToggleSettings={() => setIsSettingsOpen(!isSettingsOpen)} />

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
