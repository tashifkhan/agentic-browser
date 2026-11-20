import { QUICK_ACTIONS, type QuickAction } from "./commands";

export function QuickActions({ onPick }: { onPick: (action: QuickAction) => void }) {
	return (
		<div className="welcome__actions">
			{QUICK_ACTIONS.map((action) => (
				<button key={action.label} type="button" className="qa" onClick={() => onPick(action)}>
					<span className="qa__icon">
						<action.icon size={15} strokeWidth={1.8} />
					</span>
					<span className="qa__label">{action.label}</span>
					<span className="qa__cmd">{action.cmd.trim().split(" ")[0]}</span>
				</button>
			))}
		</div>
	);
}
