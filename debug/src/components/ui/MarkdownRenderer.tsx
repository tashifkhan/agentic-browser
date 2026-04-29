import React from "react";
import { useMarkdown } from "./useMarkdown";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const cn = (...classes: (string | undefined)[]) => classes.filter(Boolean).join(" ");

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  const { renderedParts } = useMarkdown(content);

  return (
    <div className={cn("markdown-renderer", className)}>
      {renderedParts}
    </div>
  );
};

export default MarkdownRenderer;
