import type { CSSProperties } from "react";

export function Skeleton({ width = "100%", height = 12, style }: { width?: number | string; height?: number | string; style?: CSSProperties }) {
  return <div className="ab-skeleton" style={{ width, height, ...style }} />;
}
