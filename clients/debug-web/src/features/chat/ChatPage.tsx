import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Composer } from "./Composer";
import { ConversationList } from "./ConversationList";
import { EmptyChat } from "./EmptyChat";
import { MessageList } from "./MessageList";
import { useChatSender } from "./useChatSender";
import { useVoiceConfig } from "./useVoiceConfig";
import "./chat.css";

export function ChatPage() {
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const [draft, setDraft] = useState("");
  const voice = useVoiceConfig();
  const { send, pending, busy } = useChatSender(conversationId);

  const sendNow = (text: string, attachment?: string) => {
    setDraft("");
    void send(text, attachment);
  };

  return (
    <div className="chat">
      <ConversationList activeId={conversationId} />
      <section className="chat__main">
        <div className="chat__scroll">
          {!conversationId && !pending ? (
            <EmptyChat onPick={(cmd) => (cmd.endsWith(" ") ? setDraft(cmd) : sendNow(cmd))} />
          ) : (
            <MessageList conversationId={conversationId} pending={pending} voice={voice} />
          )}
        </div>
        <Composer value={draft} onChange={setDraft} onSend={sendNow} busy={busy} />
      </section>
    </div>
  );
}

/** Route component name kept for router.tsx. */
export { ChatPage as ChatPanel };
