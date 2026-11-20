import { Fragment, useEffect, useMemo, useRef } from "react";
import { useConversationRuns, useMessages } from "@agentic-browser/shared/query";
import { QueryView, Skeleton, WorkLog } from "@agentic-browser/shared/ui";
import { AgentMessage } from "./AgentMessage";
import { RunSteps } from "./RunSteps";
import { SpeakButton } from "./SpeakButton";
import { UserMessage } from "./UserMessage";
import { pendingAnswer, type Pending } from "./useChatSender";
import { useSpeaker } from "./useSpeaker";
import type { VoiceConfig } from "./speech";

const skeleton = (
  <div className="chat__history-skeleton">
    <Skeleton width="40%" height={36} style={{ alignSelf: "flex-end", borderRadius: 12 }} />
    <Skeleton width="90%" height={12} />
    <Skeleton width="80%" height={12} />
    <Skeleton width="60%" height={12} />
  </div>
);

export function MessageList({ conversationId, pending, voice }: { conversationId?: string; pending: Pending | null; voice: VoiceConfig | null }) {
  const messagesQuery = useMessages(conversationId ?? "");
  const { data: runs } = useConversationRuns(conversationId ?? "");
  const messages = conversationId ? messagesQuery.data ?? [] : [];
  const speaker = useSpeaker(voice, messages);
  const bottom = useRef<HTMLDivElement>(null);

  // Each reply links to the run that produced it, so its steps can load.
  const runFor = useMemo(() => new Map((runs ?? []).filter((r) => r.final_message_id).map((r) => [r.final_message_id!, r])), [runs]);
  // Runs that ended without a reply (failed, or still going) hang off the
  // question that started them.
  const openRunFor = useMemo(
    () => new Map((runs ?? []).filter((r) => !r.final_message_id && r.user_message_id).map((r) => [r.user_message_id!, r])),
    [runs],
  );

  const shown = pending && (!pending.convId || pending.convId === conversationId) ? pending : null;
  const answer = shown ? pendingAnswer(shown) : "";

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, answer, shown?.events.length]);

  const last = messages[messages.length - 1];
  const pendingQuestionSaved = shown && last?.role === "user" && last.content.trim() === shown.question;

  return (
    <div className="chat__column">
      {conversationId && (
        <QueryView query={messagesQuery} skeleton={skeleton} errorHint="Messages come from Postgres.">
          {(list) =>
            list.map((m) => {
              if (m.role === "user") {
                const open = openRunFor.get(m.message_id);
                // While this question's reply is streaming, the pending block shows it.
                const showOpen = open && !(shown && m === last);
                return (
                  <Fragment key={m.message_id}>
                    <UserMessage content={m.content} />
                    {showOpen && (
                      <AgentMessage
                        content={open.status === "failed" ? "" : open.final_answer ?? ""}
                        at={open.completed_at ?? open.started_at}
                        steps={<RunSteps runId={open.run_id} live={open.status === "running"} />}
                        streaming={open.status === "running"}
                      />
                    )}
                  </Fragment>
                );
              }
              const run = runFor.get(m.message_id);
              return (
                <AgentMessage
                  key={m.message_id}
                  content={m.content}
                  at={m.created_at}
                  steps={run && <RunSteps runId={run.run_id} live={false} />}
                  actions={voice && <SpeakButton state={speaker.stateFor(m.message_id)} onClick={() => speaker.toggle(m.message_id, m.content)} />}
                />
              );
            })
          }
        </QueryView>
      )}
      {shown && !pendingQuestionSaved && <UserMessage content={shown.question} />}
      {shown && (
        <AgentMessage
          content={answer}
          streaming={!shown.failed}
          steps={<WorkLog events={shown.events} live={!shown.failed} />}
        />
      )}
      <div ref={bottom} />
    </div>
  );
}
