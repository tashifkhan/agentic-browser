import { useState, useEffect } from "react";

const BACKEND_URL = "http://localhost:5000";

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

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tokenStatus, setTokenStatus] = useState<string>("");
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

  const initAuth = async () => {
    const result = await browser.storage.local.get("googleUser");
    let savedUser: any = result.googleUser;

    if (savedUser) {
      await checkAndRefreshToken(savedUser);
      setAuthLoading(false);
    } else {
      setAuthLoading(false);
    }
  };

  const refreshAccessToken = async (refreshToken: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/refresh-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) throw new Error("Failed to refresh token");
      const data = await response.json();
      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in || 3600,
      };
    } catch (error) {
      console.error("Error refreshing token:", error);
      return null;
    }
  };

  const checkAndRefreshToken = async (userData: any) => {
    const tokenAge = userData.tokenTimestamp
      ? Date.now() - userData.tokenTimestamp
      : Infinity;

    if (tokenAge > 3300000 && userData.refreshToken) {
      setTokenStatus("🔄 Refreshing token...");
      const refreshResult = await refreshAccessToken(userData.refreshToken);

      if (refreshResult) {
        const updatedUserData = {
          ...userData,
          token: refreshResult.accessToken,
          tokenTimestamp: Date.now(),
          tokenExpiresIn: refreshResult.expiresIn,
        };
        await browser.storage.local.set({ googleUser: updatedUserData });
        setUser(updatedUserData);
        setTokenStatus("✅ Token refreshed successfully");
        return;
      } else {
        setTokenStatus("⚠️ Failed to refresh token - please re-authenticate");
        setUser(userData);
        return;
      }
    }

    if (tokenAge > 3600000 && !userData.refreshToken) {
      setTokenStatus("❌ Token expired - please re-authenticate");
    } else if (userData.refreshToken) {
      setTokenStatus("✅ Token valid (with auto-refresh)");
    } else {
      setTokenStatus("⚠️ Token valid (no refresh token - will expire)");
    }
    setUser(userData);
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
        "openid email profile https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/gmail.readonly";

      const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=${encodeURIComponent(
        scopes
      )}&access_type=offline&prompt=consent`;

      const redirectResponse = await identityApi.launchWebAuthFlow({
        url: authUrl,
        interactive: true,
      });

      const codeMatch = redirectResponse?.match(/code=([^&]+)/);
      const code = codeMatch ? codeMatch[1] : null;
      if (!code) throw new Error("No authorization code found in response");

      const tokenResponse = await fetch(`${BACKEND_URL}/exchange-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code, redirect_uri: redirectUri }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(`Token exchange failed: ${errorData.error}`);
      }

      const tokenData = await tokenResponse.json();
      const token = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      const expiresIn = tokenData.expires_in || 3600;

      const userInfo = await fetch(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${token}`
      ).then((res) => res.json());

      const fullUserData = {
        ...userInfo,
        token,
        refreshToken,
        tokenTimestamp: Date.now(),
        tokenExpiresIn: expiresIn,
        redirectUri,
        loginTime: new Date().toISOString(),
        browser: browserInfo.name,
      };
      await browser.storage.local.set({ googleUser: fullUserData });
      setUser(fullUserData);
      setTokenStatus("✅ Token valid (with auto-refresh)");
    } catch (err: any) {
      console.error("Auth Error:", err);
      if (
        String(err).toLowerCase().includes("user cancelled") ||
        String(err).toLowerCase().includes("denied") ||
        String(err).toLowerCase().includes("aborted")
      ) {
        alert(
          "Authentication cancelled. Please allow access in the popup to sign in."
        );
      } else {
        alert(
          `Authentication failed: ${err.message}\n\nMake sure the backend service is running.`
        );
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    setAuthLoading(true);
    try {
      const identityApi = browser.identity;
      if (!identityApi) throw new Error("browser.identity API not available");

      const redirectUri = identityApi.getRedirectURL();
      const clientId = "Ov23liL9c4T8V8Yh3k0s"; // GitHub OAuth App Client ID
      const scopes = "read:user user:email";

      const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=${encodeURIComponent(scopes)}`;

      const redirectResponse = await identityApi.launchWebAuthFlow({
        url: authUrl,
        interactive: true,
      });

      const codeMatch = redirectResponse?.match(/code=([^&]+)/);
      const code = codeMatch ? codeMatch[1] : null;
      if (!code) throw new Error("No authorization code found in response");

      const tokenResponse = await fetch(`${BACKEND_URL}/github/exchange-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(`Token exchange failed: ${errorData.error}`);
      }

      const tokenData = await tokenResponse.json();
      const token = tokenData.access_token;

      const userInfo = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json());

      const fullUserData = {
        id: userInfo.id,
        name: userInfo.name || userInfo.login,
        email: userInfo.email,
        picture: userInfo.avatar_url,
        login: userInfo.login,
        token,
        tokenTimestamp: Date.now(),
        loginTime: new Date().toISOString(),
        browser: browserInfo.name,
        provider: "github",
      };
      await browser.storage.local.set({ googleUser: fullUserData });
      setUser(fullUserData);
      setTokenStatus("✅ GitHub authenticated");
    } catch (err: any) {
      console.error("GitHub Auth Error:", err);
      if (
        String(err).toLowerCase().includes("user cancelled") ||
        String(err).toLowerCase().includes("denied") ||
        String(err).toLowerCase().includes("aborted")
      ) {
        alert(
          "Authentication cancelled. Please allow access in the popup to sign in."
        );
      } else {
        alert(
          `GitHub authentication failed: ${err.message}\n\nMake sure the backend service is running.`
        );
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await browser.storage.local.remove("googleUser");
    setUser(null);
    setTokenStatus("");
  };

  const getTokenAge = () => {
    if (!user?.tokenTimestamp) return "Unknown";
    const ageMs = Date.now() - user.tokenTimestamp;
    const ageMinutes = Math.floor(ageMs / 60000);
    const ageHours = Math.floor(ageMinutes / 60);
    const remainingMinutes = ageMinutes % 60;

    if (ageHours > 0) {
      return `${ageHours}h ${remainingMinutes}m`;
    }
    return `${ageMinutes}m`;
  };

  const getTokenExpiry = () => {
    if (!user?.tokenTimestamp || !user?.tokenExpiresIn) return "Unknown";
    const expiryTime = new Date(
      user.tokenTimestamp + user.tokenExpiresIn * 1000
    );
    const now = new Date();
    const remainingMs = expiryTime.getTime() - now.getTime();

    if (remainingMs <= 0) return "Expired";

    const remainingMinutes = Math.floor(remainingMs / 60000);
    return `${remainingMinutes} minutes`;
  };

  const handleManualRefresh = async () => {
    if (!user?.refreshToken) {
      alert("No refresh token available. Please re-authenticate.");
      return;
    }

    setTokenStatus("🔄 Refreshing token...");

    const refreshResult = await refreshAccessToken(user.refreshToken);

    if (refreshResult) {
      const updatedUserData = {
        ...user,
        token: refreshResult.accessToken,
        tokenTimestamp: Date.now(),
        tokenExpiresIn: refreshResult.expiresIn,
      };
      await browser.storage.local.set({ googleUser: updatedUserData });
      setUser(updatedUserData);
      setTokenStatus("✅ Token refreshed successfully");
    } else {
      setTokenStatus("❌ Failed to refresh token");
      alert("Failed to refresh token. Please re-authenticate.");
    }
  };

  return {
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
  };
}
