import {
  Zap,
  Shield,
  Brain,
  Sparkles,
  Github,
  Waves,
  Network,
  Cpu,
} from "lucide-react";

interface SignInScreenProps {
  onLogin: () => void;
  onGitHubLogin: () => void;
}

export function SignInScreen({ onLogin, onGitHubLogin }: SignInScreenProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily: "'Outfit', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Animated grid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(66, 133, 244, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(66, 133, 244, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
          animation: "gridMove 20s linear infinite",
        }}
      />

      {/* Gradient orbs */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          left: "10%",
          width: "300px",
          height: "300px",
          background:
            "radial-gradient(circle, rgba(66, 133, 244, 0.15) 0%, transparent 70%)",
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
          background:
            "radial-gradient(circle, rgba(138, 43, 226, 0.15) 0%, transparent 70%)",
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
            width: "56px",
            height: "56px",
            margin: "0 auto 16px",
            background: "linear-gradient(135deg, #4285f4 0%, #8a2be2 100%)",
            borderRadius: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:
              "0 8px 32px rgba(66, 133, 244, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            animation: "pulse 2s ease-in-out infinite",
            position: "relative",
          }}
        >
          <Zap size={28} color="white" strokeWidth={2.5} />
          <div
            style={{
              position: "absolute",
              inset: -2,
              background: "linear-gradient(135deg, #4285f4, #8a2be2)",
              borderRadius: "18px",
              opacity: 0.5,
              filter: "blur(8px)",
              zIndex: -1,
              animation: "glow 2s ease-in-out infinite",
            }}
          />
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            margin: "0 0 6px 0",
            background: "linear-gradient(135deg, #ffffff 0%, #a0a0a0 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "-1px",
          }}
        >
          Open DIA
        </h1>

        <p
          style={{
            fontSize: "12px",
            color: "#666",
            margin: "0 0 24px 0",
            lineHeight: "1.6",
            fontWeight: 400,
          }}
        >
          AI-powered browser automation with Model Context Protocol
        </p>

        {/* Feature highlights */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            marginBottom: "24px",
          }}
        >
          <FeatureCard
            icon={<Network size={16} />}
            title="MCP"
            description="Model Context Protocol"
            gradient="linear-gradient(135deg, rgba(66, 133, 244, 0.1) 0%, transparent 100%)"
          />
          <FeatureCard
            icon={<Cpu size={16} />}
            title="Multi-Model"
            description="13+ AI models"
            gradient="linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, transparent 100%)"
          />
          <FeatureCard
            icon={<Waves size={16} />}
            title="Streaming"
            description="Real-time responses"
            gradient="linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, transparent 100%)"
          />
          <FeatureCard
            icon={<Sparkles size={16} />}
            title="Adaptive"
            description="Context-aware AI"
            gradient="linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, transparent 100%)"
          />
        </div>

        {/* Sign in buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            onClick={onLogin}
            style={{
              width: "100%",
              padding: "12px 20px",
              fontSize: "14px",
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              letterSpacing: "0.2px",
              color: "white",
              background: "linear-gradient(135deg, #4285f4 0%, #5294ff 100%)",
              border: "1px solid rgba(66, 133, 244, 0.3)",
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow:
                "0 4px 20px rgba(66, 133, 244, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 8px 32px rgba(66, 133, 244, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)";
              e.currentTarget.style.borderColor = "rgba(66, 133, 244, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 4px 20px rgba(66, 133, 244, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)";
              e.currentTarget.style.borderColor = "rgba(66, 133, 244, 0.3)";
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
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
              padding: "12px 20px",
              fontSize: "14px",
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              letterSpacing: "0.2px",
              color: "white",
              background: "linear-gradient(135deg, #24292e 0%, #1a1e22 100%)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow:
                "0 4px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 4px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
            }}
          >
            <Github size={18} />
            Continue with GitHub
          </button>
        </div>

        <p
          style={{
            fontSize: "10px",
            color: "#444",
            marginTop: "16px",
            lineHeight: "1.5",
          }}
        >
          Secured by OAuth 2.0 • Your data stays private
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
      `}</style>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  gradient,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}) {
  return (
    <div
      style={{
        padding: "12px 10px",
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        borderRadius: "14px",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
        e.currentTarget.style.borderColor = "rgba(66, 133, 244, 0.3)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: gradient,
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: "relative",
          color: "#4285f4",
          marginBottom: "6px",
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
          fontWeight: 600,
          color: "#e5e5e5",
          marginBottom: "4px",
        }}
      >
        {title}
      </div>
      <div
        style={{
          position: "relative",
          fontSize: "10px",
          color: "#666",
          lineHeight: "1.4",
        }}
      >
        {description}
      </div>
    </div>
  );
}
