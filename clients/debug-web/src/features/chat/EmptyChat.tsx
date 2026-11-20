import { Kbd } from "@agentic-browser/shared/ui";
import { QUICK_ACTIONS } from "./commands";

/** First screen of a new chat: what the agent can do, one click away. */
export function EmptyChat({ onPick }: { onPick: (cmd: string) => void }) {
  return (
    <div className="chat__empty ab-dotgrid">
      <div className="chat__empty-inner ab-stagger">
        <h2>What should the agent do?</h2>
        <p>
          It can search, read pages and videos, check your mail and calendar, and recall what it knows about you. Type <Kbd>/</Kbd> for
          commands.
        </p>
        <div className="chat__chips">
          {QUICK_ACTIONS.map(({ Icon, label, cmd }) => (
            <button key={cmd} type="button" className="chat__chip" onClick={() => onPick(cmd)}>
              <Icon size={16} />
              <span>
                <span className="chat__chip-label">{label}</span>
                <span className="chat__chip-cmd">{cmd.trim()}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
