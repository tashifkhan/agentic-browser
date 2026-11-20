import { useEffect, useMemo, useRef } from "react";
import { useConversationRuns, useMessages } from "@agentic-browser/shared/query";
import { QueryView, Skeleton } from "@agentic-browser/shared/ui";
import { AgentMessage } from "./AgentMessage";
import { RunSteps } from "./RunSteps";
import { SpeakButton } from "./SpeakButton";
import { StepsDisclosure } from "./StepsDisclosure";
import { UserMessage } from "./UserMessage";
import type { Pending } from "./useChatSender";
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

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending?.answer, pending?.steps.length]);

  const last = messages[messages.length - 1];
  const pendingQuestionSaved = pending && last?.role === "user" && last.content.trim() === pending.question;

  return (
    <div className="chat__column">
      {conversationId && (
        <QueryView query={messagesQuery} skeleton={skeleton} errorHint="Messages come from Postgres.">
          {(list) =>
            list.map((m) =>
              m.role === "user" ? (
                <UserMessage key={m.message_id} content={m.content} />
              ) : (
                <AgentMessage
                  key={m.message_id}
                  content={m.content}
                  at={m.created_at}
                  steps={runFor.get(m.message_id) && <RunSteps runId={runFor.get(m.message_id)!.run_id} live={false} />}
                  actions={voice && <SpeakButton state={speaker.stateFor(m.message_id)} onClick={() => speaker.toggle(m.message_id, m.content)} />}
                />
              ),
            )
          }
        </QueryView>
      )}
      {pending && !pendingQuestionSaved && <UserMessage content={pending.question} />}
      {pending && <AgentMessage content={pending.answer} streaming steps={<StepsDisclosure steps={pending.steps} live defaultOpen />} />}
      <div ref={bottom} />
    </div>
  );
}
