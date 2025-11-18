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
          backgroundColor: "#1a1a1a",
          border: `1px solid ${isFocused ? "#4285f4" : "#2a2a2a"}`,
          borderRadius: "8px",
          color: "#e5e5e5",
          outline: "none",
          transition: "all 0.2s ease",
          boxSizing: "border-box",
          boxShadow: isFocused ? "0 0 0 3px rgba(66, 133, 244, 0.1)" : "none",
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
              "linear-gradient(90deg, transparent, #4285f4, transparent)",
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
