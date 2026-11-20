import { Calendar, Globe, Mail, MessageCircle, Search, TvMinimalPlay } from "@agentic-browser/shared/icons";

export type SlashCommand = { cmd: string; description: string; takesArgs: boolean; args?: string };

export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "/react-ask", description: "Ask the agent with tools and memory", takesArgs: true, args: "question" },
  { cmd: "/google-search", description: "Search the web and summarise", takesArgs: true, args: "query" },
  { cmd: "/youtube-ask", description: "Ask about a YouTube video", takesArgs: true, args: "url question" },
  { cmd: "/website-ask", description: "Ask about a web page", takesArgs: true, args: "url question" },
  { cmd: "/github-ask", description: "Ask about a GitHub repository", takesArgs: true, args: "url question" },
  { cmd: "/skill-run", description: "Run an installed skill", takesArgs: true, args: "skill prompt" },
  { cmd: "/gmail-unread", description: "Summarise unread email", takesArgs: false },
  { cmd: "/calendar-events", description: "List upcoming events", takesArgs: false },
];

export const QUICK_ACTIONS = [
  { Icon: MessageCircle, label: "Ask the agent", cmd: "/react-ask " },
  { Icon: Search, label: "Search the web", cmd: "/google-search " },
  { Icon: TvMinimalPlay, label: "Ask about a video", cmd: "/youtube-ask " },
  { Icon: Globe, label: "Ask about a page", cmd: "/website-ask " },
  { Icon: Mail, label: "Unread email", cmd: "/gmail-unread" },
  { Icon: Calendar, label: "Upcoming events", cmd: "/calendar-events" },
];

export function matchCommands(input: string): SlashCommand[] {
  if (!input.startsWith("/") || input.includes(" ")) return [];
  return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input));
}

export type ChatRequest = { endpoint: string; stream: boolean; payload: Record<string, unknown>; label: string };

/** Turn what the user typed into the backend call that answers it. */
export function resolveRequest(input: string, conversationId: string): ChatRequest {
  const parts = input.trim().split(" ");
  const cmd = parts[0];
  const rest = parts.slice(1).join(" ");
  const urlAndQuestion = { url: parts[1] || "", question: parts.slice(2).join(" "), chat_history: [] };
  switch (cmd) {
    case "/youtube-ask":
      return { endpoint: "/api/genai/youtube", stream: false, payload: urlAndQuestion, label: cmd };
    case "/website-ask":
      return { endpoint: "/api/genai/website", stream: false, payload: urlAndQuestion, label: cmd };
    case "/github-ask":
      return { endpoint: "/api/genai/github", stream: false, payload: urlAndQuestion, label: cmd };
    case "/google-search":
      return { endpoint: "/api/google-search", stream: false, payload: { query: rest || input, question: rest, chat_history: [] }, label: cmd };
    case "/gmail-unread":
      return { endpoint: "/api/gmail/unread", stream: false, payload: {}, label: cmd };
    case "/calendar-events":
      return { endpoint: "/api/calendar/events", stream: false, payload: {}, label: cmd };
    case "/skill-run":
      return { endpoint: "/api/skills/execute", stream: false, payload: { skill_name: parts[1] || "", prompt: parts.slice(2).join(" ") }, label: cmd };
    case "/react-ask":
      return { endpoint: "/api/genai/react", stream: true, payload: { question: rest || input, conversation_id: conversationId }, label: cmd };
    default:
      return { endpoint: "/api/genai/react", stream: true, payload: { question: input, conversation_id: conversationId }, label: "agent" };
  }
}
