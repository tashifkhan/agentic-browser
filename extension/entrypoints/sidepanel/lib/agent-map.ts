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

    google: {
        label: "Google Search",
        actions: {
            search: "/api/google-search",
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
            login: "/api/pyjiit/login",
            semesters: "/api/pyjiit/semesters",
            attendence: "/api/pyjiit/attendence",
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
    },

    upload: {
        label: "File Upload",
        actions: {
            file: "/api/upload",
        }
    },

    skill: {
        label: "Skills",
        actions: {
            run: "/api/skills/execute",
        }
    }

};
export type AgentKey = keyof typeof AGENT_MAP;
export type AgentActionKey<T extends AgentKey> = keyof typeof AGENT_MAP[T]["actions"];