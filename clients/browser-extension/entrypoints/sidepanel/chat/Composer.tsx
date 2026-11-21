import { useEffect, useRef, type KeyboardEvent } from "react";
import { ArrowUp, FileText, Mic, MicOff, MousePointerClick, Paperclip, Square, X } from "@agentic-browser/shared/icons";
import { IconButton } from "@agentic-browser/shared/ui";
import { ModelPicker } from "./ModelPicker";
import type { ModelChoice } from "../../utils/modelChoice";
import type { AttachedFile } from "./types";

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 200;
const ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.txt,.md,.csv,.json,.xml,.py,.js,.ts,.html,.css";

export type ComposerProps = {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	/** Gets first look at keys; return true to stop default handling. */
	onMenuKey: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
	busy: boolean;
	onStop: () => void;
	onBrowserAction: () => void;
	model: ModelChoice;
	onModelChange: (choice: ModelChoice) => void;
	listening: boolean;
	onToggleVoice: () => void;
	attachment: AttachedFile | null;
	uploading: boolean;
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onAttach: () => void;
	onRemoveAttachment: () => void;
	focusSignal?: number;
};

export function Composer(p: ComposerProps) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const hasInput = p.value.trim().length > 0;

	// Grow with the text up to MAX_HEIGHT.
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.max(MIN_HEIGHT, Math.min(el.scrollHeight, MAX_HEIGHT))}px`;
	}, [p.value]);

	useEffect(() => {
		if (p.focusSignal) ref.current?.focus();
	}, [p.focusSignal]);

	return (
		<div className={`composer${p.busy ? " is-busy" : ""}${p.listening ? " is-listening" : ""}`}>
			<input type="file" ref={p.fileInputRef} onChange={p.onFileSelect} style={{ display: "none" }} accept={ACCEPT} />

			{(p.attachment || p.uploading) && (
				<div className="composer__chips">
					{p.attachment && (
						<span className="chip">
							<FileText size={12} />
							<span className="chip__name">{p.attachment.name}</span>
							<span className="chip__size">{(p.attachment.size / 1024).toFixed(1)} KB</span>
							<button className="chip__x" onClick={p.onRemoveAttachment} aria-label="Remove attachment">
								<X size={11} />
							</button>
						</span>
					)}
					{p.uploading && (
						<span className="chip">
							<span className="ab-spinner" style={{ width: 11, height: 11 }} />
							<span className="chip__name">Uploading</span>
						</span>
					)}
				</div>
			)}

			{p.listening ? (
				<div className="voice">
					<span className="voice__dot" />
					<span className="voice__label">Listening</span>
					<div className="voice__wave" aria-hidden="true">
						{Array.from({ length: 18 }, (_, i) => (
							<span key={i} style={{ animationDelay: `${(i % 6) * 0.09}s` }} />
						))}
					</div>
				</div>
			) : (
				<textarea
					ref={ref}
					value={p.value}
					onChange={(e) => p.onChange(e.target.value)}
					onKeyDown={(e) => {
						if (p.onMenuKey(e)) return;
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							p.onSubmit();
						}
					}}
					placeholder={p.busy ? "Working on it..." : "Ask anything, or type / for commands"}
					disabled={p.busy}
					className="composer__input"
					rows={1}
					aria-label="Message"
				/>
			)}

			<div className="composer__bar">
				<ModelPicker value={p.model} onChange={p.onModelChange} />
				<IconButton size="sm" label="Run as browser action" title="Act on this page with the text you typed" onClick={p.onBrowserAction}>
					<MousePointerClick size={15} />
				</IconButton>
				<IconButton size="sm" label="Attach a file" onClick={p.onAttach} disabled={p.uploading}>
					<Paperclip size={15} />
				</IconButton>
				<IconButton size="sm" label={p.listening ? "Stop recording" : "Dictate"} className={p.listening ? "is-rec" : undefined} onClick={p.onToggleVoice}>
					{p.listening ? <MicOff size={15} /> : <Mic size={15} />}
				</IconButton>
				<span className="composer__spacer" />
				{p.busy ? (
					<IconButton variant="default" label="Stop" className="composer__send composer__stop" onClick={p.onStop}>
						<Square size={11} weight="Filled" />
					</IconButton>
				) : (
					<IconButton
						variant={hasInput ? "primary" : "default"}
						label="Send"
						title="Send (Enter)"
						className="composer__send"
						onClick={p.onSubmit}
						disabled={!hasInput}
					>
						<ArrowUp size={16} strokeWidth={2.4} />
					</IconButton>
				)}
			</div>
		</div>
	);
}
