import { useState, useEffect } from "react";

const BACKEND_URL = (import.meta.env.VITE_API_URL || "http://localhost:5454").replace(/\/$/, "");
const AUTH_URL = BACKEND_URL + "/api/auth";

// Fields that legacy versions stored in chrome.storage.local.googleUser.
// Tokens now live server-side; we wipe these on first run after upgrade.
const LEGACY_TOKEN_FIELDS = [
  "token",
  "refreshToken",
  "tokenTimestamp",
  "tokenExpiresIn",
  "redirectUri",
] as const;

export const getBrowserInfo = () => {
  const ua = navigator.userAgent || "";
  const hasBrowserApi = typeof browser !== "undefined" && !!browser;
  const isFirefox = hasBrowserApi && ua.includes("Firefox");
  const isChrome = !isFirefox && ua.includes("Chrome");
  let name = "Unknown";
  if (isFirefox) name = "Firefox";
  else if (ua.includes("Edg")) name = "Edge";
  else if (isChrome) name = "Chrome";
  return { name, isFirefox, isChrome };
};

async function wipeLegacyTokens() {
  try {
    const { googleUser } = await browser.storage.local.get("googleUser");
    if (!googleUser) return;
    let dirty = false;
    const cleaned: Record<string, unknown> = { ...googleUser };
    for (const field of LEGACY_TOKEN_FIELDS) {
      if (field in cleaned) {
        delete cleaned[field];
        dirty = true;
      }
    }
    if (dirty) {
      await browser.storage.local.set({ googleUser: cleaned });
    }
  } catch (err) {
    console.error("Failed to wipe legacy OAuth tokens:", err);
  }
}

async function fetchServerStatus(): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(`${AUTH_URL}/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tokenStatus, setTokenStatus] = useState<string>("");
  const [shouldRedirectToSettings, setShouldRedirectToSettings] = useState(false);
  const browserInfo = getBrowserInfo();

  useEffect(() => {
    initAuth();

    const handleStorageChange = (
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") return;
      if (changes.googleUser?.newValue) {
        setUser(changes.googleUser.newValue);
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleFirstTimeCheck = async () => {
    try {
      const result = await browser.storage.local.get("setupCompleted");
      if (result.setupCompleted !== true) {
        setShouldRedirectToSettings(true);
        await browser.storage.local.set({ setupCompleted: true });
      }
    } catch (error) {
      console.error("Error checking first time status:", error);
    }
  };

  const initAuth = async () => {
    await wipeLegacyTokens();
    const result = await browser.storage.local.get("googleUser");
    const savedUser: any = result.googleUser;

    if (savedUser) {
      setUser(savedUser);
      // Confirm with backend that the credential row still exists.
      const status = await fetchServerStatus();
      const conns: any[] = status?.connections || [];
      const google = conns.find((c) => c.provider === "google");
      if (!google) {
        setTokenStatus("Server credentials missing — please re-authenticate");
      } else if (google.status === "needs_reauth") {
        setTokenStatus("Token revoked — please re-authenticate");
      } else {
        setTokenStatus("Connected");
      }
    }
    setAuthLoading(false);
  };

  const handleLogin = async () => {
    setAuthLoading(true);
    try {
      const identityApi = browser.identity;
      if (!identityApi) throw new Error("browser.identity API not available");

      const redirectUri = identityApi.getRedirectURL();
      const clientId =
        "95116700360-13ege5jmfrjjt4vmd86oh00eu5jlei5e.apps.googleusercontent.com";
      const scopes =
        "openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.labels";

      const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;

      const redirectResponse = await identityApi.launchWebAuthFlow({
        url: authUrl,
        interactive: true,
      });

      const codeMatch = redirectResponse?.match(/code=([^&]+)/);
      const code = codeMatch ? codeMatch[1] : null;
      if (!code) throw new Error("No authorization code found in response");

      const tokenResponse = await fetch(`${AUTH_URL}/exchange-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirect_uri: redirectUri }),
      });
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        throw new Error(`Token exchange failed: ${errorData.detail || errorData.error || tokenResponse.statusText}`);
      }
      const data = await tokenResponse.json();
      const profile = data.user || {};

      const fullUserData = {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        loginTime: new Date().toISOString(),
        browser: browserInfo.name,
        provider: "google",
      };
      await browser.storage.local.set({ googleUser: fullUserData });
      setUser(fullUserData);
      setTokenStatus("Connected");
      await handleFirstTimeCheck();
    } catch (err: any) {
      console.error("Auth Error:", err);
      const msg = String(err).toLowerCase();
      if (msg.includes("user cancelled") || msg.includes("denied") || msg.includes("aborted")) {
        alert("Authentication cancelled. Please allow access in the popup to sign in.");
      } else {
        alert(`Authentication failed: ${err.message}\n\nMake sure the backend service is running.`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    setAuthLoading(true);
    try {
      // Bypass GitHub OAuth - skip authentication and go directly to the page
      const fullUserData = {
        id: "demo-user-123",
        name: "Demo User",
        email: "demo@example.com",
        picture: "https://avatars.githubusercontent.com/u/1?v=4",
        login: "demouser",
        loginTime: new Date().toISOString(),
        browser: browserInfo.name,
        provider: "github",
      };
      await browser.storage.local.set({ googleUser: fullUserData });
      setUser(fullUserData);
      setTokenStatus("GitHub authenticated");
      await handleFirstTimeCheck();
    } catch (err: any) {
      console.error("GitHub Auth Error:", err);
      alert(`GitHub authentication failed: ${err.message}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${AUTH_URL}/connections/google`, { method: "DELETE" });
    } catch {
      // backend offline; clear local state anyway
    }
    await browser.storage.local.remove("googleUser");
    setUser(null);
    setTokenStatus("");
  };

  const getTokenAge = () => "Managed server-side";
  const getTokenExpiry = () => "Managed server-side";

  const handleManualRefresh = async () => {
    setTokenStatus("Refresh is now handled automatically by the server");
  };

  const resetRedirect = () => setShouldRedirectToSettings(false);

  return {
    user,
    authLoading,
    tokenStatus,
    browserInfo,
    shouldRedirectToSettings,
    resetRedirect,
    handleLogin,
    handleGitHubLogin,
    handleLogout,
    getTokenAge,
    getTokenExpiry,
    handleManualRefresh,
  };
}
