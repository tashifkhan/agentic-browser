import type { ComposioConnection } from "../../../types/api";

export const SUGGESTED_TOOLKITS = ["gmail", "googlecalendar", "github", "notion", "slack", "linear", "linkedin", "instagram", "aeroleads"];

export function connectionTitle(c: ComposioConnection) {
  return c.alias || c.account_label || c.account_email || c.account_name || c.id || "Unnamed account";
}

export const isActive = (c: ComposioConnection) => (c.status || "").toLowerCase() === "active";
export const isPending = (c: ComposioConnection) => (c.status || "").toLowerCase() === "initiated";
