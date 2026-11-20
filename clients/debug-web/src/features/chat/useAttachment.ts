import { useState } from "react";

export type Attachment = { name: string; path: string; size: number };

/** Upload a file so the agent can read it with the next message. */
export function useAttachment() {
  const [file, setFile] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(f: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", f);
      const resp = await fetch("/api/upload/", { method: "POST", body: form });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      setFile({ name: data.filename, path: data.path, size: data.size });
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return { file, uploading, error, upload, clear: () => setFile(null) };
}
