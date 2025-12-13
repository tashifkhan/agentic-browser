export const AGENT_MAP = {
    gmail: {
        label: "Gmail",
        actions: {
            unread: "/api/gmail/unread",
            latest: "/api/gmail/latest",
            send: "/api/gmail/send",
            mark_read: "/api/gmail/mark_read",
        }
    },

    calendar: {
        label: "Calendar",
        actions: {
            events: "/api/calendar/events",
            create: "/api/calendar/create",
        }
    },

    "google-search": {
        label: "Google Search",
        actions: {
            run: "/api/google-search",
        }
    },

    youtube: {
        label: "YouTube",
        actions: {
            ask: "/api/genai/youtube",
        }
    },

    website: {
        label: "Website",
        actions: {
            ask: "/api/genai/website",
        }
    },

    github: {
        label: "Github",
        actions: {
            crawl: "/api/genai/github",
        }
    },

    pyjiit: {
        label: "JIIT Web Portal",
        actions: {
            semesters: "/api/pyjiit/semesters",
        }
    },

    react: {
        label: "React AI",
        actions: {
            ask: "/api/genai/react"
        }
    },

    browser: {
        label: "Browser Agent",
        actions: {
            action: "/api/agent/generate-script",
        }
    }

};
export type AgentKey = keyof typeof AGENT_MAP;
export type AgentActionKey<T extends AgentKey> = keyof typeof AGENT_MAP[T]["actions"];