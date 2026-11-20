import type { Browser } from "wxt/browser";
import { Globe } from "@agentic-browser/shared/icons";

const host = (url?: string) => {
	try {
		return new URL(url || "").hostname;
	} catch {
		return "";
	}
};

export function MentionMenu({ tabs, onPick }: { tabs: Browser.tabs.Tab[]; onPick: (value: string) => void }) {
	return (
		<div className="popover" role="listbox" aria-label="Mention a tab">
			<div className="popover__head">
				<span className="ab-eyebrow">Mention a tab</span>
			</div>
			<div className="popover__list">
				{tabs.length === 0 && <div className="popover__empty">No open tabs.</div>}
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						className="cmd"
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => onPick(tab.url || tab.title || "Untitled Tab")}
					>
						<span className="cmd__icon">{tab.favIconUrl ? <img src={tab.favIconUrl} alt="" width={14} height={14} /> : <Globe size={14} />}</span>
						<span className="cmd__name cmd__name--text">{tab.title || tab.url}</span>
						<span className="cmd__desc">{host(tab.url)}</span>
					</button>
				))}
			</div>
		</div>
	);
}
