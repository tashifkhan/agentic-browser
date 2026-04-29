import {
  Zap,
  Shield,
  Brain,
  Sparkles,
  Github,
  Waves,
  Network,
  Cpu,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";

interface SignInScreenProps {
  onLogin: () => void;
  onGitHubLogin: () => void;
  theme?: "dark" | "light";
  themePreference?: "dark" | "light" | "system";
  onToggleTheme?: () => void;
}

export function SignInScreen({
  onLogin,
  onGitHubLogin,
  theme = "dark",
  themePreference,
  onToggleTheme,
}: SignInScreenProps) {
  const isLight = theme === "light";
  const pref = themePreference ?? theme;
  const ThemeIcon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  const themeLabel =
    pref === "dark"
      ? "Dark mode (click for light)"
      : pref === "light"
        ? "Light mode (click for system)"
        : "System mode (click for dark)";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: isLight 
          ? "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)" 
          : "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily: "'Outfit', sans-serif",
        position: "relative",
        overflow: "hidden",
        transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Animated grid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: isLight
            ? `
              linear-gradient(rgba(244, 63, 94, 0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(244, 63, 94, 0.05) 1px, transparent 1px)
            `
            : `
              linear-gradient(rgba(232, 121, 160, 0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(232, 121, 160, 0.03) 1px, transparent 1px)
            `,
          backgroundSize: "50px 50px",
          animation: "gridMove 20s linear infinite",
        }}
      />

      {/* Theme Toggle Button */}
      {onToggleTheme && (
        <button
          onClick={onToggleTheme}
          title={themeLabel}
          aria-label={themeLabel}
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            zIndex: 10,
            background: isLight ? "rgba(255, 255, 255, 0.8)" : "rgba(20, 20, 20, 0.8)",
            border: `1px solid ${isLight ? "#e2e8f0" : "#333"}`,
            color: isLight ? "#1a1a1a" : "#fff",
            padding: "10px",
            borderRadius: "12px",
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.borderColor = isLight ? "#d8638a" : "#e879a0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.borderColor = isLight ? "#e2e8f0" : "#333";
          }}
        >
          <ThemeIcon size={20} />
        </button>
      )}

      {/* Gradient orbs */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          left: "10%",
          width: "300px",
          height: "300px",
          background: isLight
            ? "radial-gradient(circle, rgba(244, 63, 94, 0.1) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(232, 121, 160, 0.15) 0%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(60px)",
          animation: "float 8s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          right: "10%",
          width: "250px",
          height: "250px",
          background: isLight
            ? "radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(192, 80, 122, 0.15) 0%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(60px)",
          animation: "float 10s ease-in-out infinite reverse",
        }}
      />

      {/* Main content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          maxWidth: "440px",
          width: "100%",
        }}
      >
        {/* Logo/Icon */}
        <div
          style={{
            width: "160px",
            height: "160px",
            margin: "0 auto 20px",
            borderRadius: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: isLight
              ? "0 20px 40px rgba(244, 63, 94, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)"
              : "0 8px 32px rgba(232, 121, 160, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            animation: "pulse 12s ease-in-out infinite",
            position: "relative",
            overflow: "hidden",
            background: isLight ? "#fff" : "#000",
          }}
        >
          <img 
            src="/app_icon.jpg" 
            alt="Open DIA Logo"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "24px",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: -2,
              background: isLight 
                ? "linear-gradient(135deg, #f43f5e, #fb7185)"
                : "linear-gradient(135deg, #e879a0, #c0507a)",
              borderRadius: "24px",
              opacity: 0.3,
              filter: "blur(8px)",
              zIndex: -1,
              animation: "glow 2s ease-in-out infinite",
            }}
          />
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: "44px",
            fontWeight: 900,
            margin: "0 0 12px 0",
            color: isLight ? "#000000" : "#ffffff",
            letterSpacing: "-2.5px",
            display: "block",
            width: "100%",
            textAlign: "center",
          }}
        >
          Open DIA
        </h1>




        <p
          style={{
            fontSize: "15px",
            color: isLight ? "#1e293b" : "#d1d5db",
            margin: "0 0 32px 0",
            lineHeight: "1.6",
            fontWeight: 500,
          }}
        >
          AI-powered browser automation with Model Context Protocol
        </p>


        {/* Feature highlights */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            marginBottom: "32px",
          }}
        >
          <FeatureCard
            icon={<Network size={18} color={isLight ? "#f43f5e" : "#e879a0"} />}
            title="MCP"
            description="Context Protocol"
            isLight={isLight}
          />
          <FeatureCard
            icon={<Cpu size={18} color={isLight ? "#f43f5e" : "#e879a0"} />}
            title="Multi-Model"
            description="13+ AI models"
            isLight={isLight}
          />
          <FeatureCard
            icon={<Waves size={18} color={isLight ? "#f43f5e" : "#e879a0"} />}
            title="Streaming"
            description="Real-time UI"
            isLight={isLight}
          />
          <FeatureCard
            icon={<Sparkles size={18} color={isLight ? "#f43f5e" : "#e879a0"} />}
            title="Adaptive"
            description="Context-aware"
            isLight={isLight}
          />
        </div>

        {/* Sign in buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            onClick={onLogin}
            style={{
              width: "100%",
              padding: "14px 24px",
              fontSize: "15px",
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              letterSpacing: "0.2px",
              color: "white",
              background: isLight 
                ? "linear-gradient(135deg, #f43f5e, #e11d48)"
                : "linear-gradient(135deg, #e879a0, #c0507a)",
              border: "none",
              borderRadius: "14px",
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: isLight
                ? "0 10px 20px rgba(244, 63, 94, 0.3)"
                : "0 4px 20px rgba(232, 121, 160, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = isLight
                ? "0 15px 30px rgba(244, 63, 94, 0.4)"
                : "0 8px 32px rgba(232, 121, 160, 0.35)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = isLight
                ? "0 10px 20px rgba(244, 63, 94, 0.3)"
                : "0 4px 20px rgba(232, 121, 160, 0.25)";
            }}
          >
            <svg width="20" height="20" viewBox="0 0 18 18">
              <path
                fill="white"
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
              />
              <path
                fill="white"
                d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z"
              />
              <path
                fill="white"
                d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              />
              <path
                fill="white"
                d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z"
              />
            </svg>
            Continue with Google
          </button>

          <button
            onClick={onGitHubLogin}
            style={{
              width: "100%",
              padding: "14px 24px",
              fontSize: "15px",
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              letterSpacing: "0.2px",
              color: "white",
              background: isLight 
                ? "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)"
                : "linear-gradient(135deg, #24292e 0%, #1a1e22 100%)",
              border: isLight ? "none" : "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "14px",
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: isLight
                ? "0 10px 20px rgba(15, 23, 42, 0.2)"
                : "0 4px 20px rgba(0, 0, 0, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = isLight
                ? "0 15px 30px rgba(15, 23, 42, 0.3)"
                : "0 8px 32px rgba(0, 0, 0, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = isLight
                ? "0 10px 20px rgba(15, 23, 42, 0.2)"
                : "0 4px 20px rgba(0, 0, 0, 0.3)";
            }}
          >
            <Github size={20} />
            Continue with GitHub
          </button>
        </div>

        <p
          style={{
            fontSize: "11px",
            color: isLight ? "#94a3b8" : "#444",
            marginTop: "20px",
            lineHeight: "1.5",
            fontWeight: 500,
          }}
        >
          Secured by OAuth 2.0 | Open Source AI
        </p>
      </div>

      {/* Floating animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }
        
        @keyframes glow {
          0%, 100% {
            opacity: 0.5;
          }
          50% {
            opacity: 0.8;
          }
        }
        
        @keyframes gridMove {
          0% {
            transform: translate(0, 0);
          }
          100% {
            transform: translate(50px, 50px);
          }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-20px) scale(1.05); }
        }
      `}</style>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  isLight,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  isLight: boolean;
}) {
  return (
    <div
      style={{
        padding: "16px 12px",
        background: isLight ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.02)",
        border: `1px solid ${isLight ? "#e2e8f0" : "rgba(255, 255, 255, 0.06)"}`,
        borderRadius: "18px",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        overflow: "hidden",
        backdropFilter: isLight ? "blur(10px)" : "none",
        boxShadow: isLight ? "0 4px 6px -1px rgba(0, 0, 0, 0.05)" : "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isLight ? "#fff" : "rgba(255, 255, 255, 0.04)";
        e.currentTarget.style.borderColor = isLight ? "#f43f5e" : "rgba(232, 121, 160, 0.3)";
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = isLight ? "0 10px 15px -3px rgba(0, 0, 0, 0.1)" : "none";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isLight ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.02)";
        e.currentTarget.style.borderColor = isLight ? "#e2e8f0" : "rgba(255, 255, 255, 0.06)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = isLight ? "0 4px 6px -1px rgba(0, 0, 0, 0.05)" : "none";
      }}
    >
      <div
        style={{
          position: "relative",
          marginBottom: "8px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div
        style={{
          position: "relative",
          fontSize: "13px",
          fontWeight: 700,
          color: isLight ? "#0f172a" : "#e5e5e5",
          marginBottom: "4px",
        }}
      >
        {title}
      </div>
      <div
        style={{
          position: "relative",
          fontSize: "11px",
          color: isLight ? "#64748b" : "#666",
          lineHeight: "1.4",
          fontWeight: 500,
        }}
      >
        {description}
      </div>
    </div>
  );
}

