import { AppMark, Kbd } from "@agentic-browser/shared/ui";
import { QuickActions } from "./QuickActions";
import type { QuickAction } from "./commands";

export function EmptyState({ dimmed, onPick }: { dimmed: boolean; onPick: (action: QuickAction) => void }) {
	return (
		<div className={`welcome ab-dotgrid${dimmed ? " is-dimmed" : ""}`}>
			<div className="welcome__inner ab-stagger">
				<AppMark size={36} />
				<h2 className="welcome__title">What should I do?</h2>
				<p className="welcome__lede">Ask about this page, your inbox or calendar, or have me act in the browser.</p>
				<QuickActions onPick={onPick} />
				<p className="welcome__tips">
					<Kbd>/</Kbd> commands <span>·</span> <Kbd>@</Kbd> mention a tab
				</p>
			</div>
		</div>
	);
}
