import { Markdown } from "./Markdown";

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="msg msg--user ab-rise">
      <div className="msg__bubble markdown-body">
        <Markdown text={content} />
      </div>
    </div>
  );
}
