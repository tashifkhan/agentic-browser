import { ChevronDown } from "@agentic-browser/shared/icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@agentic-browser/shared/ui";
import { MODELS } from "./types";

export function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
	const current = MODELS.find((m) => m.id === value);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button type="button" className="model-chip" aria-label="Model">
					<span className="model-chip__dot" />
					<span>{current?.name || value}</span>
					<ChevronDown size={12} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="start" style={{ width: 230 }}>
				<DropdownMenuLabel>Model</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={value} onValueChange={onChange}>
					{MODELS.map((m) => (
						<DropdownMenuRadioItem key={m.id} value={m.id} hint={m.provider}>
							{m.name}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
