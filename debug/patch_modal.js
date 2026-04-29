const fs = require('fs');

let content = fs.readFileSync('src/components/MemoryPanel.tsx', 'utf8');

// Add import
content = content.replace(
  'import { api, type Claim } from "../lib/api";',
  'import { api, type Claim } from "../lib/api";\nimport { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";'
);

// Remove the early return
content = content.replace('  if (!isOpen) return null;\n', '');

// Replace render
const oldRenderStart = `  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 600,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px",
          border: "1px solid var(--border)",
          borderRadius: 16,
          display: "grid",
          gap: 16,
          background: "var(--bg-1)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="section-label" style={{ marginBottom: 6, fontSize: 16, color: "var(--text-primary)" }}>Add Memory</div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.5 }}>
              Build the profile memory from LinkedIn, Google account details, pasted notes, or uploaded docs.
            </div>
          </div>`;

const newRenderStart = `  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent style={{ maxWidth: 640 }}>
        <DialogHeader>
          <DialogTitle>Add Memory</DialogTitle>
          <DialogDescription>
            Build the profile memory from LinkedIn, Google account details, pasted notes, or uploaded docs.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: "grid", gap: 16, marginTop: 8 }}>`;

content = content.replace(oldRenderStart, newRenderStart);

// Replace the close button stuff
const closeButtonHtml = `            <button onClick={onClose} style={{ ...secondaryButtonStyle, padding: "9px" }} aria-label="Close">
              ✕
            </button>
          </div>
        </div>`;

const newCloseButtonHtml = `          </div>
        </div>`;
content = content.replace(closeButtonHtml, newCloseButtonHtml);

// Fix end tags
const oldRenderEnd = `      {status && (
        <div style={{ fontSize: 12, color: status.toLowerCase().includes("failed") ? "var(--red)" : "var(--text-secondary)" }}>
          {status}
        </div>
      )}
      </div>
    </div>
  );`;

const newRenderEnd = `        {status && (
          <div style={{ fontSize: 13, fontWeight: 500, color: status.toLowerCase().includes("failed") ? "var(--status-disconnected-text)" : "var(--text-primary)" }}>
            {status}
          </div>
        )}
      </div>
      </DialogContent>
    </Dialog>
  );`;

content = content.replace(oldRenderEnd, newRenderEnd);

fs.writeFileSync('src/components/MemoryPanel.tsx', content);
