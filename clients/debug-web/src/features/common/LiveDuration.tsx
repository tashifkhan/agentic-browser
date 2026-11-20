import { useEffect, useState } from "react";
import { formatDuration } from "@agentic-browser/shared/format";

/** Ticks every second while `status` is running; static otherwise. */
export function LiveDuration({ startedAt, status, durationS }: { startedAt?: string | null; status: string; durationS?: number | null }) {
  const running = status === "running" && !!startedAt;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (running) return <>{formatDuration(Math.max(0, (now - new Date(startedAt!).getTime()) / 1000))}</>;
  return <>{formatDuration(durationS ?? null)}</>;
}
