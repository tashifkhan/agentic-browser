export type AgentDefinition = {
  label: string;
  description: string;
  placeholder?: string;
  actions: Record<string, string>;
};

export const AGENT_MAP = {
  health: {
    label: "Health",
    description: "Check the backend service status.",
    placeholder: "/health-check",
    actions: {
      check: "/api/genai/health/",
    },
  },
  react: {
    label: "React Agent",
    description: "Use the reactive agent to reason over your request.",
    placeholder: "/react-run <question>",
    actions: {
      run: "/api/genai/react",
    },
  },
  website: {
    label: "Website",
    description: "Summarise or analyse a webpage.",
    placeholder: "/website-insight <url> <question>",
    actions: {
      insight: "/api/genai/website/",
    },
  },
  youtube: {
    label: "YouTube",
    description: "Ask questions about a YouTube video.",
    placeholder: "/youtube-insight <url> <question>",
    actions: {
      insight: "/api/genai/youtube/",
    },
  },
  github: {
    label: "GitHub",
    description: "Analyse a GitHub repository.",
    placeholder: "/github-review <url> <question>",
    actions: {
      review: "/api/genai/github/",
    },
  },
  search: {
    label: "Google Search",
    description: "Search the web for the latest results.",
    placeholder: "/search-web <query>",
    actions: {
      web: "/api/google-search/",
    },
  },
  gmail: {
    label: "Gmail",
    description: "Work with your Gmail inbox.",
    placeholder: "/gmail-unread",
    actions: {
      unread: "/api/gmail/unread",
      latest: "/api/gmail/latest",
      mark_read: "/api/gmail/mark_read",
      send: "/api/gmail/send",
    },
  },
  calendar: {
    label: "Calendar",
    description: "Read and create Google Calendar events.",
    placeholder: "/calendar-events",
    actions: {
      events: "/api/calendar/events",
      create: "/api/calendar/create",
    },
  },
  pyjiit: {
    label: "PyJIIT Portal",
    description: "Interact with the JIIT portal helpers.",
    placeholder: "/pyjiit-login",
    actions: {
      login: "/api/pyjiit/login",
      semesters: "/api/pyjiit/semesters",
      attendence: "/api/pyjiit/attendence",
    },
  },
} as const satisfies Record<string, AgentDefinition>;

export type AgentKey = keyof typeof AGENT_MAP;
export type AgentActionKey<A extends AgentKey> = keyof (typeof AGENT_MAP[A]["actions"]);
