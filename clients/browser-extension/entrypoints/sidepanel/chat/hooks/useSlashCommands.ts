import { useEffect, useState } from "react";
import { parseAgentCommand } from "../../../utils/parseAgentCommand";
import { BACKEND_URL } from "../types";
import type { Skill } from "../commands";

/**
 * Suggestions for `/agent-action` commands as the user types, including saved
 * skills after `/skill-run`. `complete(value)` applies a picked suggestion and
 * returns the new input text (it auto-completes single-action agents).
 */
export function useSlashCommands() {
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [selected, setSelected] = useState(-1);
	const [skills, setSkills] = useState<Skill[]>([]);

	useEffect(() => {
		fetch(`${BACKEND_URL}/api/skills/`)
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => d && setSkills(d.skills || []))
			.catch((e) => console.error("Failed to fetch skills:", e));
	}, []);

	const set = (list: string[], picked: boolean) => {
		setSuggestions(list);
		setSelected(picked && list.length ? 0 : -1);
	};

	const evaluate = (value: string, fromSelection = false): string => {
		const parsed: any = parseAgentCommand(value);
		if (!parsed) {
			set([], false);
			return value;
		}
		if (parsed.agent === "skill" && parsed.actions && parsed.actions[0] === "run") {
			const query = (value.match(/^\/skill-run\s*(.*)$/i)?.[1] ?? "").toLowerCase();
			const matches = query
				? skills.filter((s) => s.name.toLowerCase().startsWith(query) || s.id.toLowerCase().startsWith(query))
				: skills;
			setSuggestions(matches.map((s) => `/skill-run ${s.id} `));
			setSelected(fromSelection ? 0 : -1);
			return fromSelection && !value.endsWith(" ") ? `${value} ` : value;
		}
		if (parsed.stage === "agent_select" || parsed.stage === "agent_partial") {
			setSuggestions(parsed.agents.map((a: string) => `/${a}`));
			setSelected(fromSelection ? 0 : -1);
			return value;
		}
		if (parsed.stage === "action_select" || parsed.stage === "action_partial") {
			const actions: string[] = parsed.actions;
			if (fromSelection && actions.length === 1) {
				set([], false);
				return `/${parsed.agent}-${actions[0]} `;
			}
			setSuggestions(actions.map((a) => `/${parsed.agent}-${a}`));
			setSelected(fromSelection ? 0 : -1);
			return value;
		}
		set([], false);
		if (parsed.stage === "complete" && fromSelection && !value.endsWith(" ")) return `${value} `;
		return value;
	};

	return {
		suggestions,
		selected,
		setSelected,
		skills,
		/** Call on every input change. */
		update: (value: string) => void evaluate(value, false),
		/** Apply a suggestion; returns the text to put in the composer. */
		complete: (suggestion: string) => evaluate(suggestion + (suggestion.endsWith(" ") ? "" : " "), true),
		close: () => set([], false),
		move: (delta: 1 | -1) =>
			setSelected((i) => {
				const n = suggestions.length;
				if (!n) return -1;
				return delta === 1 ? (i < n - 1 ? i + 1 : 0) : i > 0 ? i - 1 : n - 1;
			}),
	};
}

export type SlashApi = ReturnType<typeof useSlashCommands>;
