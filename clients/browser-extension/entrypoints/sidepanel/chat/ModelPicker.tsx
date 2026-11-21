import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, RotateCw } from "@agentic-browser/shared/icons";
import { queryKeys, useApi } from "@agentic-browser/shared/query";
import type { CatalogModel, CatalogProvider } from "@agentic-browser/shared/api";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	SearchField,
} from "@agentic-browser/shared/ui";
import type { ModelChoice } from "../../utils/modelChoice";

const DEFAULT = "__default__";
// Per provider, before you search. OpenRouter alone lists hundreds.
const PREVIEW = 6;

const encode = (c: ModelChoice) => (c ? `${c.provider}\u0000${c.model}` : DEFAULT);
const decode = (v: string): ModelChoice => {
	if (v === DEFAULT) return null;
	const [provider, model] = v.split("\u0000");
	return { provider, model };
};

function matches(m: CatalogModel, q: string) {
	return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
}

function contextHint(m: CatalogModel) {
	if (!m.context) return undefined;
	return m.context >= 1_000_000 ? `${Math.round(m.context / 100_000) / 10}M` : `${Math.round(m.context / 1000)}k`;
}

/**
 * Model for the next requests. Lists the models of every provider that has a
 * key (or an endpoint), from models.dev or the provider's custom endpoint.
 */
export function ModelPicker({ value, onChange }: { value: ModelChoice; onChange: (c: ModelChoice) => void }) {
	const { api, baseUrl } = useApi();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [refresh, setRefresh] = useState(false);
	const catalog = useQuery({
		queryKey: [...queryKeys.models(baseUrl), refresh],
		queryFn: () => api.llmModels(refresh),
		enabled: open || value !== null,
		staleTime: 10 * 60_000,
	});

	const providers: CatalogProvider[] = useMemo(
		() => (catalog.data?.providers ?? []).filter((p) => p.configured || p.id === value?.provider),
		[catalog.data, value?.provider],
	);
	const fallback = catalog.data?.default;
	const q = query.trim().toLowerCase();

	const label = value
		? providers.find((p) => p.id === value.provider)?.models.find((m) => m.id === value.model)?.name ?? value.model
		: fallback
			? `Default · ${fallback.model}`
			: "Default model";

	return (
		<DropdownMenu
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setQuery("");
			}}
		>
			<DropdownMenuTrigger asChild>
				<button type="button" className="model-chip" aria-label="Model" title={value ? `${value.provider} / ${value.model}` : undefined}>
					<span className="model-chip__dot" />
					<span className="model-chip__name">{label}</span>
					<ChevronDown size={12} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="start" className="model-menu">
				<div className="model-menu__search" onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}>
					<SearchField value={query} onChange={setQuery} placeholder="Search models" autoFocus />
					<button
						type="button"
						className="model-menu__refresh"
						aria-label="Reload model lists"
						title="Reload from models.dev and custom endpoints"
						onClick={() => setRefresh((r) => !r)}
					>
						<RotateCw size={13} className={catalog.isFetching ? "spin-icon" : undefined} />
					</button>
				</div>
				<div className="model-menu__list">
					<DropdownMenuRadioGroup value={encode(value)} onValueChange={(v) => onChange(decode(v))}>
						{!q && (
							<DropdownMenuRadioItem value={DEFAULT} hint={fallback ? fallback.provider : undefined}>
								Default{fallback ? ` · ${fallback.model}` : ""}
							</DropdownMenuRadioItem>
						)}
						{catalog.isLoading && <DropdownMenuLabel>Loading models…</DropdownMenuLabel>}
						{catalog.isError && <DropdownMenuLabel>Couldn't load models from the backend.</DropdownMenuLabel>}
						{catalog.data && providers.length === 0 && (
							<DropdownMenuLabel>No provider has a key yet. Add one in Settings → Model.</DropdownMenuLabel>
						)}
						{providers.map((p) => {
							const all = q ? p.models.filter((m) => matches(m, q)) : p.models;
							const picked = value?.provider === p.id ? value.model : null;
							let shown = q ? all.slice(0, 40) : all.slice(0, PREVIEW);
							if (picked && !shown.some((m) => m.id === picked)) {
								const found = p.models.find((m) => m.id === picked);
								shown = [found ?? { id: picked, name: picked }, ...shown];
							}
							if (q && shown.length === 0) return null;
							const more = all.length - shown.length;
							return (
								<div key={p.id}>
									<DropdownMenuSeparator />
									<DropdownMenuLabel>
										{p.label}
										<span className="model-menu__source">{p.source === "endpoint" ? "your endpoint" : "models.dev"}</span>
									</DropdownMenuLabel>
									{p.error && <div className="model-menu__error">{p.error}</div>}
									{shown.map((m) => (
										<DropdownMenuRadioItem key={m.id} value={encode({ provider: p.id, model: m.id })} hint={contextHint(m)}>
											<span className="model-menu__name" title={m.id}>{m.name}</span>
										</DropdownMenuRadioItem>
									))}
									{more > 0 && <div className="model-menu__more">{q ? `${more} more match, keep typing` : `${more} more, search to find them`}</div>}
								</div>
							);
						})}
					</DropdownMenuRadioGroup>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
