import { useState, useRef, type CSSProperties } from "react";
import { api } from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

export function MemoryInitModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [linkedinText, setLinkedinText] = useState("");
  const [googleProfileText, setGoogleProfileText] = useState("");
  const [notes, setNotes] = useState("");
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [status, setStatus] = useState<string>("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const queueProfileText = async () => {
    if (!linkedinText.trim() && !googleProfileText.trim() && !notes.trim()) {
      setStatus("Add LinkedIn, Google profile, or notes first.");
      return;
    }
    setBusyAction("profile");
    setStatus("");
    try {
      const result = await api.ingestProfile({
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

  const queueLinkedInMe = async () => {
    setBusyAction("linkedin-me");
    setStatus("");
    try {
      const result = await api.ingestComposioLinkedInMe({ ingest: true, trust_level: 9 });
      const claims = result.ingestion?.claims_created ?? 0;
      setStatus(`LinkedIn imported via ${result.tool_name}. ${claims > 0 ? `${claims} claims created.` : "Memory ingest queued."}`);
    } catch (err) {
      setStatus(`LinkedIn import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyAction(null);
    }
  };

  const queueAeroLeads = async () => {
    if (!linkedInUrl.trim()) {
      setStatus("Enter a LinkedIn URL first.");
      return;
    }
    setBusyAction("aeroleads");
    setStatus("");
    try {
      const result = await api.ingestAeroLeadsLinkedIn({
        linkedin_url: linkedInUrl.trim(),
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
      const result = await api.ingestProfileDocument(formData);
      setStatus(`Queued document ingest for ${result.filename ?? file.name}.`);
    } catch (err) {
      setStatus(`Document upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      setBusyAction(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent style={{ maxWidth: 720, background: "var(--bg-sidebar)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}>
        <DialogHeader>
          <DialogTitle>Add Memory</DialogTitle>
          <DialogDescription style={{ color: "var(--text-muted)" }}>
            Enrich your profile memory graph. Choose a direct import method or paste data manually.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: "grid", gap: 20, marginTop: 8 }}>
          {/* Quick Actions Row */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "16px", background: "rgba(0,0,0,0.1)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <div style={{ width: "100%", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              1-Click Imports
            </div>
            <button
              type="button"
              onClick={queueLinkedInMe}
              disabled={busyAction !== null}
              style={{ ...actionButtonStyle(busyAction === "linkedin-me"), display: "flex", alignItems: "center", gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
              {busyAction === "linkedin-me" ? "Importing…" : "Import LinkedIn"}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busyAction !== null}
              style={{ ...secondaryButtonStyle, display: "flex", alignItems: "center", gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
              {busyAction === "document" ? "Uploading…" : "Upload Document"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              style={{ display: "none" }}
              onChange={(e) => void uploadDocument(e.target.files?.[0] ?? null)}
            />
          </div>

          <div style={{ width: "100%", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>
            Manual Entry
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>LinkedIn Bio / Experience</span>
              <textarea
                value={linkedinText}
                onChange={(e) => setLinkedinText(e.target.value)}
                placeholder="Paste your LinkedIn summary, work experience, or skills here..."
                style={textareaStyle}
              />
            </label>
            <div style={{ display: "grid", gap: 16 }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>Google Profile / General Notes</span>
                <textarea
                  value={googleProfileText}
                  onChange={(e) => setGoogleProfileText(e.target.value)}
                  placeholder="Paste account details, bio, or any other relevant profile info..."
                  style={{ ...textareaStyle, minHeight: 50 }}
                />
              </label>
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>Extra Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything else the memory graph should know..."
                  style={{ ...textareaStyle, minHeight: 50 }}
                />
              </label>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "16px", background: "rgba(0,0,0,0.1)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            <input
              type="url"
              value={linkedInUrl}
              onChange={(e) => setLinkedInUrl(e.target.value)}
              placeholder="https://linkedin.com/in/username (for AeroLeads enrich)"
              style={{
                flex: 1,
                minWidth: 200,
                padding: "8px 12px",
                background: "var(--input-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                color: "var(--text-primary)",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
                transition: "border-color 0.2s"
              }}
            />
            <button 
              type="button"
              onClick={queueAeroLeads} 
              disabled={busyAction !== null || !linkedInUrl.trim()} 
              style={{
                ...secondaryButtonStyle,
                opacity: linkedInUrl.trim() ? 1 : 0.5,
                cursor: linkedInUrl.trim() ? "pointer" : "not-allowed"
              }}
            >
              {busyAction === "aeroleads" ? "Enriching…" : "Enrich URL"}
            </button>
          </div>

          {status && (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: status.toLowerCase().includes("failed") ? "rgba(248, 113, 113, 0.1)" : "rgba(74, 222, 128, 0.1)", fontSize: 13, fontWeight: 500, color: status.toLowerCase().includes("failed") ? "#f87171" : "#4ade80" }}>
              {status}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border-color)" }}>
          <button 
            type="button"
            onClick={onClose} 
            style={{ ...secondaryButtonStyle, padding: "10px 20px" }}
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={queueProfileText} 
            disabled={busyAction !== null || (!linkedinText.trim() && !googleProfileText.trim() && !notes.trim())} 
            style={{
              ...actionButtonStyle(busyAction === "profile"),
              padding: "10px 24px",
              opacity: (!linkedinText.trim() && !googleProfileText.trim() && !notes.trim()) ? 0.5 : 1,
              cursor: (!linkedinText.trim() && !googleProfileText.trim() && !notes.trim()) ? "not-allowed" : "pointer"
            }}
          >
            {busyAction === "profile" ? "Queueing…" : "Save Text Entries"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const textareaStyle: CSSProperties = {
  minHeight: 110,
  resize: "vertical",
  padding: "10px 12px",
  background: "var(--input-bg)",
  border: "1px solid var(--border-color)",
  borderRadius: 8,
  color: "var(--text-primary)",
  fontSize: 12,
  fontFamily: "inherit",
  lineHeight: 1.5,
};

function actionButtonStyle(active: boolean): CSSProperties {
  return {
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid var(--accent-color)",
    background: active ? "var(--accent-glow)" : "var(--accent-color)",
    color: active ? "var(--accent-color)" : "#fff",
    fontSize: 12,
    fontWeight: 500,
    cursor: active ? "wait" : "pointer",
    transition: "all 0.2s",
  };
}

const secondaryButtonStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-color)",
  background: "rgba(255,255,255,0.05)",
  color: "var(--text-primary)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 0.2s",
};
