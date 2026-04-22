import { useState, useEffect } from "react";
import "./App.css";
import { AgentExecutor } from "./AgentExecutor";
import { UnifiedSettingsMenu } from "./components/UnifiedSettingsMenu";
import { SignInScreen } from "./components/SignInScreen";
import { LoadingScreen } from "./components/LoadingScreen";
import { useAuth } from "./hooks/useAuth";
import { useTabManagement } from "./hooks/useTabManagement";
import { useWebSocket } from "./hooks/useWebSocket";
import { Sun, Moon } from "lucide-react";


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
	const [theme, setTheme] = useState<"dark" | "light">("dark");

	useEffect(() => {
		const savedTheme = localStorage.getItem("theme") as "dark" | "light";
		if (savedTheme) {
			setTheme(savedTheme);
			document.documentElement.setAttribute("data-theme", savedTheme);
		}
	}, []);

	const toggleTheme = () => {
		const newTheme = theme === "dark" ? "light" : "dark";
		setTheme(newTheme);
		document.documentElement.setAttribute("data-theme", newTheme);
		localStorage.setItem("theme", newTheme);
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
				theme={theme}
				onToggleTheme={toggleTheme}
			/>
		);
	}


	return (
		<div className="app">
			<header>
				<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
					<img src="/app_icon.jpg" alt="Icon" className="header-icon" />
					<h1 style={{ 
						color: theme === 'light' ? '#000000' : '#ffffff',
						margin: 0,
						fontSize: '20px',
						fontWeight: 800,
						letterSpacing: '-0.5px'
					}}>Open DIA</h1>
				</div>
				<button className="theme-toggle" onClick={toggleTheme}>
					{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
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
				position={{ bottom: "110px", right: "8px" }}
				isOpen={isSettingsOpen}
				onToggle={() => setIsSettingsOpen(!isSettingsOpen)}
			/>
		</div>
	);
}

export default App;
