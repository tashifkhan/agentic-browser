import { useRef, useState, type ChangeEvent } from "react";
import { BACKEND_URL, isImageName, type AttachedFile } from "../types";

/** One uploaded file waiting to be sent with the next message. */
export function useAttachment(onError: (message: string) => void) {
	const [file, setFile] = useState<AttachedFile | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const onSelect = async (e: ChangeEvent<HTMLInputElement>) => {
		const picked = e.target.files?.[0];
		if (!picked) return;
		setIsUploading(true);
		try {
			const form = new FormData();
			form.append("file", picked);
			const resp = await fetch(`${BACKEND_URL}/api/upload/`, { method: "POST", body: form });
			if (!resp.ok) throw new Error(`Upload failed: ${await resp.text()}`);
			const data = await resp.json();
			setFile({
				name: data.filename,
				path: data.path,
				size: data.size,
				url: `${BACKEND_URL}${data.download_url}`,
				isImage: String(data.content_type || "").startsWith("image/") || isImageName(data.filename),
			});
		} catch (err: any) {
			onError(err.message || "File upload failed");
		} finally {
			setIsUploading(false);
			if (inputRef.current) inputRef.current.value = "";
		}
	};

	/** Returns the attachment and clears it, for sending with a message. */
	const take = () => {
		const current = file;
		setFile(null);
		return current;
	};

	return { file, isUploading, inputRef, onSelect, take, clear: () => setFile(null), open: () => inputRef.current?.click() };
}
