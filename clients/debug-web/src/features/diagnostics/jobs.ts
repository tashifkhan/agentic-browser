import type { MaintenanceRun } from "@agentic-browser/shared/api";

export const JOBS: Record<string, { label: string; color: string; when: string }> = {
  micro_reflection: { label: "Micro reflection", color: "var(--info)", when: "after conversations" },
  hourly: { label: "Hourly", color: "var(--teal)", when: "every hour" },
  nightly: { label: "Nightly", color: "var(--violet)", when: "daily at 03:00" },
  weekly: { label: "Weekly", color: "var(--accent)", when: "Sundays at 04:00" },
};

export function jobOf(run: MaintenanceRun) {
  return JOBS[run.run_type] ?? { label: run.run_type.replace(/_/g, " "), color: "var(--text-3)", when: "" };
}

export function jobDuration(run: MaintenanceRun): number | null {
  if (!run.started_at || !run.finished_at) return null;
  return (new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000;
}
