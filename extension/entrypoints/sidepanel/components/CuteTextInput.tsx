import { useState } from "react";

interface CuteTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  onSubmit?: () => void;
}

export function CuteTextInput({
  value,
  onChange,
  placeholder = "Type something...",
  type = "text",
  onSubmit,
}: CuteTextInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSubmit) {
      onSubmit();
    }
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
      }}
    >
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "10px 12px",
          fontSize: "13px",
          fontFamily: "inherit",
          backgroundColor: "var(--input-bg)",
          border: `1px solid ${isFocused ? "var(--accent-color)" : "var(--border-color)"}`,
          borderRadius: "8px",
          color: "var(--text-secondary)",
          outline: "none",
          transition: "all 0.2s ease",
          boxSizing: "border-box",
          boxShadow: isFocused ? "var(--accent-glow)" : "none",
        }}
      />
      {isFocused && (
        <div
          style={{
            position: "absolute",
            bottom: "-2px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "80%",
            height: "2px",
            background:
              "linear-gradient(90deg, transparent, var(--accent-color), transparent)",
            borderRadius: "2px",
            animation: "fadeIn 0.2s ease",
          }}
        />
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
