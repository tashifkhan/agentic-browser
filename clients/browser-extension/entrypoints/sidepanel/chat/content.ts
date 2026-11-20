// Turns raw agent output into displayable markdown.

/** Unwraps JSON-ish model output ([{type:"text",text:...}]) into plain text. */
export function parseContent(raw: string): string {
	if (!raw) return "";
	const s = raw.trim();

	const extractText = (obj: any): string[] => {
		if (Array.isArray(obj)) return obj.flatMap(extractText);
		if (obj && typeof obj === "object") {
			if (obj.type === "text" && typeof obj.text === "string") return [obj.text];
			if (typeof obj.text === "string" && Object.keys(obj).length <= 2) return [obj.text];
		}
		if (typeof obj === "string") return [obj];
		return [];
	};

	try {
		const parsed = JSON.parse(s);
		if (typeof parsed === "object" && parsed !== null) {
			const texts = extractText(parsed);
			if (texts.length > 0) return texts.join("\n\n");
		}
		if (typeof parsed === "string") return parsed;
	} catch {
		/* not JSON */
	}

	if (s.startsWith("[{") || s.startsWith("{'")) {
		try {
			const jsonified = s.replace(/'/g, '"').replace(/"s\b/g, "'s").replace(/\\n/g, "\n");
			const texts = extractText(JSON.parse(jsonified));
			if (texts.length > 0) return texts.join("\n\n");
		} catch {
			/* not python-ish JSON either */
		}
	}

	const textBlockPattern = /["']text["']\s*:\s*["']((?:[^"'\\]|\\.)*)["']/g;
	const matches: string[] = [];
	let m;
	while ((m = textBlockPattern.exec(s)) !== null) {
		const decoded = m[1].replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, "\\");
		if (decoded.length > 10) matches.push(decoded);
	}
	if (matches.length > 0) return matches.join("\n\n");
	return raw;
}

/** Renders an arbitrary JSON response as readable indented text. */
export function formatResponseToText(data: any): string {
	if (!data) return "Empty response.";
	if (typeof data === "string") return data;

	const humanize = (key: string) =>
		key
			.replace(/[_-]/g, " ")
			.replace(/([a-z])([A-Z])/g, "$1 $2")
			.replace(/\s+/g, " ")
			.replace(/^./, (x) => x.toUpperCase());

	const parse = (obj: any, indent = 0): string => {
		const pad = " ".repeat(indent);
		if (obj === null || obj === undefined) return `${pad}None`;
		if (typeof obj !== "object") return `${pad}${obj}`;
		if (Array.isArray(obj)) {
			if (obj.length === 0) return `${pad}(empty list)\n`;
			return obj.map((item) => `${pad}- ${parse(item, indent + 2).trim()}`).join("\n");
		}
		let out = "";
		for (const [key, val] of Object.entries(obj)) {
			const label = humanize(key);
			out += typeof val === "object" && val !== null ? `${pad}${label}:\n${parse(val, indent + 2)}\n` : `${pad}${label}: ${val}\n`;
		}
		return out;
	};

	return parse(data).trim();
}

/** Plain text for speech: strips tags and keeps link text. */
export const speakableText = (content: string) =>
	content.replace(/<[^>]*>?/gm, "").replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");

export function relativeDate(iso: string): string {
	const d = new Date(iso);
	const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
	if (days <= 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	if (days === 1) return "Yesterday";
	if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
	return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
