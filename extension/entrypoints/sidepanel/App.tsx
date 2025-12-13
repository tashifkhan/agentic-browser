import { useState, useEffect } from "react";
import "./App.css";
import { AgentExecutor } from "./AgentExecutor";
import { UnifiedSettingsMenu } from "./components/UnifiedSettingsMenu";
import { SignInScreen } from "./components/SignInScreen";
import { LoadingScreen } from "./components/LoadingScreen";
import { useAuth } from "./hooks/useAuth";
import { useTabManagement } from "./hooks/useTabManagement";
import { useWebSocket } from "./hooks/useWebSocket";

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
			if (changes.geminiApiKey?.newValue) {
				setApiKey(changes.geminiApiKey.newValue);
			}
		};

		browser.storage.onChanged.addListener(handleStorageChange);

		return () => {
			browser.storage.onChanged.removeListener(handleStorageChange);
			browser.tabs
				.query({ active: true, currentWindow: true })
				.then(([tab]) => {
					if (tab.id) {
						browser.runtime
							.sendMessage({
								type: "DEACTIVATE_AI_FRAME",
								tabId: tab.id,
							})
							.catch(() => {});
					}
				});
		};
	}, []);

	const loadApiKey = async () => {
		const result = await browser.storage.local.get("geminiApiKey");
		if (result.geminiApiKey) {
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
				const response = await fetch(
					"http://localhost:8080/conversation-stats"
				);
				const data = await response.json();
				if (data.ok) {
					setConversationStats(data.stats);
				}
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
					const response = await fetch(
						"http://localhost:8080/conversation-stats"
					);
					const data = await response.json();
					if (data.ok) {
						setConversationStats(data.stats);
					}
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
			<SignInScreen onLogin={handleLogin} onGitHubLogin={handleGitHubLogin} />
		);
	}

	return (
		<div className="app">
			<header>
				<h1>Open DIA</h1>
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
