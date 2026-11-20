import { Kbd } from "@agentic-browser/shared/ui";
import { slashInfo, type Skill } from "./commands";

export function SlashMenu({
	items,
	selected,
	skills,
	onHover,
	onPick,
}: {
	items: string[];
	selected: number;
	skills: Skill[];
	onHover: (index: number) => void;
	onPick: (item: string) => void;
}) {
	return (
		<div className="popover" role="listbox" aria-label="Commands">
			<div className="popover__head">
				<span className="ab-eyebrow">Commands</span>
				<span className="popover__keys">
					<Kbd>↑↓</Kbd> <Kbd>↵</Kbd> <Kbd>esc</Kbd>
				</span>
			</div>
			<div className="popover__list">
				{items.map((item, idx) => {
					const info = slashInfo(item, skills);
					const active = idx === selected;
					return (
						<div
							key={item}
							role="option"
							aria-selected={active}
							className={`cmd${active ? " is-active" : ""}`}
							onMouseEnter={() => onHover(idx)}
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => onPick(item)}
							ref={(el) => {
								if (el && active) el.scrollIntoView({ block: "nearest" });
							}}
						>
							<span className="cmd__icon">
								<info.icon size={14} strokeWidth={1.8} />
							</span>
							<span className="cmd__name">{info.name}</span>
							<span className="cmd__desc">{info.desc}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
