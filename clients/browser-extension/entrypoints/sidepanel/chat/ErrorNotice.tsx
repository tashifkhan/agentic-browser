import { X, XCircle } from "@agentic-browser/shared/icons";
import { IconButton } from "@agentic-browser/shared/ui";

export function ErrorNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
	return (
		<div className="notice" role="alert">
			<XCircle size={14} />
			<span className="notice__text">{message}</span>
			<IconButton size="sm" label="Dismiss" onClick={onDismiss}>
				<X size={13} />
			</IconButton>
		</div>
	);
}
