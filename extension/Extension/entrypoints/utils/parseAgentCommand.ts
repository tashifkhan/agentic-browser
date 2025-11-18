// utils/parseAgentCommand.ts

import { AGENT_MAP, AgentKey, AgentActionKey } from "../sidepanel/lib/agent-map";

export function parseAgentCommand(input: string) {
    if (!input.startsWith("/")) return null;

    // --- FIX START ---
    // 1. Get string after "/"
    const fullBody = input.slice(1).trim();

    // 2. Split by space and take ONLY the first part (the command key)
    // This turns "calendar-create hello world" into just "calendar-create"
    const body = fullBody.split(/\s+/)[0];
    // --- FIX END ---

    if (!body.length) {
        return {
            stage: "agent_select",
            agents: Object.keys(AGENT_MAP) as AgentKey[],
        };
    }

    // ... The rest of your code remains exactly the same ...
    if (!body.includes("-")) {
        // full agent match?
        if (body in AGENT_MAP) {
            const a = body as AgentKey;
            return {
                stage: "action_select",
                agent: a,
                actions: Object.keys(AGENT_MAP[a].actions),
            };
        }
        // ... partial matches logic ...
        const candidates = (Object.keys(AGENT_MAP) as AgentKey[]).filter((k) =>
            k.startsWith(body)
        );
        return {
            stage: "agent_partial",
            query: body,
            agents: candidates,
        };
    }

    const [agent, action] = body.split("-", 2);

    if (!(agent in AGENT_MAP)) {
        return {
            stage: "unknown_agent",
            agent,
            suggestion: Object.keys(AGENT_MAP),
        };
    }

    const a = agent as AgentKey;

    if (!action) {
        return {
            stage: "action_select",
            agent: a,
            actions: Object.keys(AGENT_MAP[a].actions),
        };
    }

    if (action in AGENT_MAP[a].actions) {
        const act = action as AgentActionKey<typeof a>;
        return {
            stage: "complete",
            agent: a,
            action: act,
            endpoint: AGENT_MAP[a].actions[act],
        };
    }

    const actionCandidates = Object.keys(AGENT_MAP[a].actions).filter((k) =>
        k.startsWith(action)
    );

    return {
        stage: "action_partial",
        agent: a,
        query: action,
        actions: actionCandidates,
    };
}