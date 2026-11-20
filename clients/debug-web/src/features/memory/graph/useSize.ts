import { useEffect, useState, type RefObject } from "react";

/** Live width and height of an element, for canvas-sized children. */
export function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: Math.max(entry.contentRect.width, 200), h: Math.max(entry.contentRect.height, 200) }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
