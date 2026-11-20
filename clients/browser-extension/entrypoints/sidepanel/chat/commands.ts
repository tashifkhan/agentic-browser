import {
	Bot,
	Calendar,
	Check,
	Code2,
	FileText,
	Globe,
	GraduationCap,
	Mail,
	MessageCircle,
	MousePointerClick,
	Paperclip,
	Plus,
	Search,
	Send,
	Sparkles,
	TvMinimalPlay,
	type IconType,
} from "@agentic-browser/shared/icons";

// Short help text for the slash menu, keyed by agent and agent-action.
const SLASH_HELP: Record<string, { icon: IconType; desc: string }> = {
	gmail: { icon: Mail, desc: "Read and send email" },
	"gmail-unread": { icon: Mail, desc: "List unread messages" },
	"gmail-latest": { icon: Mail, desc: "Show the latest messages" },
	"gmail-send": { icon: Send, desc: "Send an email" },
	"gmail-mark_read": { icon: Check, desc: "Mark messages as read" },
	calendar: { icon: Calendar, desc: "Your Google Calendar" },
	"calendar-events": { icon: Calendar, desc: "Upcoming events" },
	"calendar-create": { icon: Plus, desc: "Create an event" },
	google: { icon: Search, desc: "Search the web" },
	"google-search": { icon: Search, desc: "Search Google" },
	youtube: { icon: TvMinimalPlay, desc: "Ask about a video" },
	"youtube-ask": { icon: TvMinimalPlay, desc: "Ask about a YouTube video" },
	website: { icon: Globe, desc: "Ask about a web page" },
	"website-ask": { icon: Globe, desc: "Ask about a web page" },
	github: { icon: Code2, desc: "Ask about a repository" },
	"github-crawl": { icon: Code2, desc: "Read a repository and answer" },
	pyjiit: { icon: GraduationCap, desc: "JIIT portal: attendance, semesters" },
	"pyjiit-login": { icon: GraduationCap, desc: "Sign in to the JIIT portal" },
	"pyjiit-semesters": { icon: GraduationCap, desc: "List semesters" },
	"pyjiit-attendence": { icon: GraduationCap, desc: "Check attendance" },
	react: { icon: Bot, desc: "General agent with tools and memory" },
	"react-ask": { icon: Bot, desc: "Ask the general agent" },
	browser: { icon: MousePointerClick, desc: "Act on the current tab" },
	"browser-action": { icon: MousePointerClick, desc: "Plan and run browser actions" },
	upload: { icon: Paperclip, desc: "Attach a file" },
	"upload-file": { icon: Paperclip, desc: "Attach a file" },
	skill: { icon: Sparkles, desc: "Run a saved skill" },
	"skill-run": { icon: Sparkles, desc: "Run a saved skill" },
};

export type Skill = { name: string; id: string };

export function slashInfo(suggestion: string, skills: Skill[]): { icon: IconType; name: string; desc: string } {
	const cmd = suggestion.trim().slice(1);
	if (cmd.startsWith("skill-run ")) {
		const id = cmd.slice("skill-run ".length).trim();
		const skill = skills.find((k) => k.id === id);
		return { icon: Sparkles, name: `/skill-run ${id}`, desc: skill?.name || "Saved skill" };
	}
	const meta = SLASH_HELP[cmd] ?? SLASH_HELP[cmd.split("-")[0]];
	return { icon: meta?.icon ?? MessageCircle, name: `/${cmd}`, desc: meta?.desc ?? "" };
}

export type QuickAction = { icon: IconType; label: string; cmd: string };

/** Commands ending in a space prefill the composer; the rest run immediately. */
export const QUICK_ACTIONS: QuickAction[] = [
	{ icon: FileText, label: "Summarize this page", cmd: "/react-ask Summarize this page" },
	{ icon: MousePointerClick, label: "Do something on this page", cmd: "/browser-action " },
	{ icon: Mail, label: "Check unread email", cmd: "/gmail-unread" },
	{ icon: Calendar, label: "What's on my calendar", cmd: "/calendar-events" },
	{ icon: Search, label: "Search the web", cmd: "/google-search " },
	{ icon: TvMinimalPlay, label: "Ask about a video", cmd: "/youtube-ask " },
];
