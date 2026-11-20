// Formatting helpers shared by the extension and the console.

export function formatDuration(s: number | null | undefined): string {
  if (s === null || s === undefined || Number.isNaN(s)) return "-";
  if (s < 1) return `${Math.round(s * 1000)}ms`;
  if (s < 60) return `${s.toFixed(1)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

export function timeAgo(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 45_000) return "just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fullTime(iso: string | number | Date | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : "";
}

export function clockTime(iso: string | number | Date | null | undefined, seconds = true): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: false });
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function percent(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "-";
}

/** Group items into Today / Yesterday / This week / Older for list headers. */
export function recencyBucket(iso: string | number | Date): "Today" | "Yesterday" | "This week" | "Older" {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  if (d.getTime() >= start.getTime()) return "Today";
  if (d.getTime() >= start.getTime() - day) return "Yesterday";
  if (d.getTime() >= start.getTime() - 6 * day) return "This week";
  return "Older";
}
