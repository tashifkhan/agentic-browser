import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { ManualEntry } from "./ManualEntry";
import { QuickImports } from "./QuickImports";
import { useMemoryImport } from "./useMemoryImport";

export function AddMemoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = useMemoryImport();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent style={{ maxWidth: 620 }}>
        <DialogHeader>
          <DialogTitle>Add memory</DialogTitle>
        </DialogHeader>
        <div className="add">
          <QuickImports m={m} />
          <ManualEntry m={m} />
          {(m.isSuccess || m.isError) && (
            <p className={`add__status${m.isError ? " is-err" : ""}`} role="status">
              {m.isError ? (m.error instanceof Error ? m.error.message : "Import failed") : m.data}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
