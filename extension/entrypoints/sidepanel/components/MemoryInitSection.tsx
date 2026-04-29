import { useRef, useState, type CSSProperties } from "react";

interface MemoryInitModalProps {
  user: any;
  backendUrl: string;
  isOpen: boolean;
  onClose: () => void;
}

interface MemoryInitQueuedResponse {
  status: string;
  sources?: number;
  filename?: string;
}

interface MemoryInitLinkedInResponse {
  toolkit: string;
  tool_name: string;
  ingestion?: {
    claims_created: number;
  } | null;
}

export function MemoryInitModal({ user, backendUrl, isOpen, onClose }: MemoryInitModalProps) {
  const [linkedinText, setLinkedinText] = useState("");
  const [googleProfileText, setGoogleProfileText] = useState("");
  const [notes, setNotes] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const memoryBase = `${backendUrl.replace(/\/$/, "")}/api/memory`;

  const postJson = async <T,>(path: string, payload: unknown): Promise<T> => {
    const response = await fetch(`${memoryBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  };

  const postForm = async <T,>(path: string, formData: FormData): Promise<T> => {
    const response = await fetch(`${memoryBase}${path}`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  };

  const buildGoogleProfileText = () => {
    const lines = [
      user?.name ? `Name: ${user.name}` : "",
      user?.email ? `Email: ${user.email}` : "",
      user?.verified_email != null ? `Verified email: ${user.verified_email ? "Yes" : "No"}` : "",
      user?.provider ? `Provider: ${user.provider}` : "Google",
      user?.browser ? `Browser: ${user.browser}` : "",
      user?.loginTime ? `Last login time: ${user.loginTime}` : "",
      user?.picture ? `Avatar URL: ${user.picture}` : "",
    ].filter(Boolean);
    setGoogleProfileText(lines.join("\n"));
    setStatus("Filled Google profile text from the signed-in account.");
  };

  const queuePastedSources = async () => {
    if (!linkedinText.trim() && !googleProfileText.trim() && !notes.trim()) {
      setStatus("Add LinkedIn, Google profile, or notes first.");
      return;
    }
    setBusyAction("profile");
    setStatus("");
    try {
      const result = await postJson<MemoryInitQueuedResponse>("/ingest/profile", {
        linkedin_text: linkedinText.trim() || undefined,
        google_profile_text: googleProfileText.trim() || undefined,
        notes: notes.trim() || undefined,
        default_trust_level: 8,
      });
      setStatus(`Queued ${result.sources ?? 0} profile source${(result.sources ?? 0) === 1 ? "" : "s"}.`);
    } catch (err) {
      setStatus(`Profile ingest failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyAction(null);
    }
  };

  const importLinkedIn = async () => {
    setBusyAction("linkedin-me");
    setStatus("");
    try {
      const result = await postJson<MemoryInitLinkedInResponse>("/ingest/profile/composio/linkedin/me", {
        ingest: true,
        trust_level: 9,
      });
      const claims = result.ingestion?.claims_created ?? 0;
      setStatus(`LinkedIn imported via ${result.tool_name}. ${claims > 0 ? `${claims} claims created.` : "Memory ingest queued."}`);
    } catch (err) {
      setStatus(`LinkedIn import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyAction(null);
    }
  };

  const enrichLinkedInUrl = async () => {
    if (!linkedinUrl.trim()) {
      setStatus("Enter a LinkedIn URL first.");
      return;
    }
    setBusyAction("aeroleads");
    setStatus("");
    try {
      const result = await postJson<MemoryInitLinkedInResponse>("/ingest/profile/composio/aeroleads/linkedin", {
        linkedin_url: linkedinUrl.trim(),
        ingest: true,
        trust_level: 7,
      });
      const claims = result.ingestion?.claims_created ?? 0;
      setStatus(`AeroLeads imported via ${result.tool_name}. ${claims > 0 ? `${claims} claims created.` : "Memory ingest queued."}`);
    } catch (err) {
      setStatus(`AeroLeads import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyAction(null);
    }
  };

  const uploadDocument = async (file: File | null) => {
    if (!file) return;
    setBusyAction("document");
    setStatus("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("source_type", "profile_document");
      formData.append("trust_level", "8");
      formData.append("title", file.name);
      const result = await postForm<MemoryInitQueuedResponse>("/ingest/profile/document", formData);
      setStatus(`Queued document ingest for ${result.filename ?? file.name}.`);
    } catch (err) {
      setStatus(`Document upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      setBusyAction(null);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.6)",
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(5px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "90%",
          maxWidth: "500px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "20px",
          background: "var(--section-bg)",
          border: "1px solid var(--border-color)",
          borderRadius: "16px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
              Add Memory
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
              Build your profile memory from Google account details, LinkedIn, notes, or uploaded docs.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "16px",
              padding: "4px",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          <button onClick={buildGoogleProfileText} style={secondaryButtonStyle}>
            Use Google Account
          </button>
          <button onClick={importLinkedIn} disabled={busyAction !== null} style={primaryButtonStyle}>
            {busyAction === "linkedin-me" ? "Importing..." : "Import LinkedIn"}
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={busyAction !== null} style={secondaryButtonStyle}>
            {busyAction === "document" ? "Uploading..." : "Upload Doc"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md"
            style={{ display: "none" }}
            onChange={(e) => void uploadDocument(e.target.files?.[0] ?? null)}
          />
        </div>

        <div style={{ display: "grid", gap: "10px", marginBottom: "16px" }}>
          <TextAreaCard
            label="Google Profile"
            value={googleProfileText}
            onChange={setGoogleProfileText}
            placeholder="Google account profile details or exported profile text"
          />
          <TextAreaCard
            label="LinkedIn Text"
            value={linkedinText}
            onChange={setLinkedinText}
            placeholder="LinkedIn summary, experience, education, skills"
          />
          <TextAreaCard
            label="Notes"
            value={notes}
            onChange={setNotes}
            placeholder="Anything else worth storing in profile memory"
          />
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
          <input
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="LinkedIn URL for AeroLeads enrichment"
            style={{
              flex: 1,
              minWidth: "200px",
              padding: "12px 14px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--input-bg)",
              color: "var(--text-primary)",
              fontSize: "12px",
              outline: "none",
            }}
          />
          <button onClick={enrichLinkedInUrl} disabled={busyAction !== null} style={secondaryButtonStyle}>
            {busyAction === "aeroleads" ? "Enriching..." : "Enrich URL"}
          </button>
          <button onClick={queuePastedSources} disabled={busyAction !== null} style={primaryButtonStyle}>
            {busyAction === "profile" ? "Queueing..." : "Queue Sources"}
          </button>
        </div>

        {status ? (
          <div style={{ fontSize: "12px", color: status.toLowerCase().includes("failed") ? "#f87171" : "var(--text-secondary)", marginTop: "8px" }}>
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TextAreaCard({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label style={{ display: "grid", gap: "6px" }}>
      <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.2px" }}>
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          minHeight: "84px",
          resize: "vertical",
          padding: "12px 14px",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          background: "var(--input-bg)",
          color: "var(--text-primary)",
          fontSize: "12px",
          lineHeight: 1.5,
          fontFamily: "inherit",
          outline: "none",
        }}
      />
    </label>
  );
}

const primaryButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "12px",
  border: "none",
  background: "var(--accent-color)",
  color: "white",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "12px",
  border: "1px solid var(--border-color)",
  background: "var(--button-bg)",
  color: "var(--text-secondary)",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
};
