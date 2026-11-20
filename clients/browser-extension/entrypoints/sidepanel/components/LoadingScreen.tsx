import { AppMark } from "@agentic-browser/shared/ui";
import "../frame.css";

export function LoadingScreen() {
	return (
		<div className="boot" role="status" aria-label="Loading">
			<div className="boot__inner ab-fade">
				<AppMark size={34} />
				<div className="boot__bar" />
			</div>
		</div>
	);
}
