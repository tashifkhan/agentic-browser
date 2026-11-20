import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, FileText, Mic, MicOff, Paperclip, X } from "@agentic-browser/shared/icons";
import { IconButton, Kbd } from "@agentic-browser/shared/ui";
import { matchCommands, type SlashCommand } from "./commands";
import { SlashMenu } from "./SlashMenu";
import { useAttachment } from "./useAttachment";
import { useDictation } from "./useDictation";

/** Message field with slash commands, file attach, dictation and send. */
export function Composer({ value, onChange, onSend, busy }: { value: string; onChange: (v: string) => void; onSend: (text: string, attachment?: string) => void; busy: boolean }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);
  const suggestions = matchCommands(value);
  const attachment = useAttachment();
  const dictation = useDictation((text, autoSubmit) => (autoSubmit ? submit(text) : onChange(value ? `${value} ${text}` : text)));

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 200)}px`;
  }, [value]);

  useEffect(() => {
    setCursor(0);
  }, [suggestions.length]);

  function submit(text = value) {
    if (!text.trim() || busy) return;
    onSend(text, attachment.file?.path);
    attachment.clear();
  }

  function pick(c: SlashCommand) {
    onChange(c.cmd + (c.takesArgs ? " " : ""));
    area.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length) {
      const move = { ArrowDown: 1, ArrowUp: -1 }[e.key as "ArrowDown" | "ArrowUp"];
      if (move) {
        e.preventDefault();
        return setCursor((i) => (i + move + suggestions.length) % suggestions.length);
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        return pick(suggestions[cursor]);
      }
      if (e.key === "Escape") return onChange(value + " ");
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const canSend = !!value.trim() && !busy;
  const note = attachment.error || dictation.error;

  return (
    <div className="chat__dock">
      <div className="composer-wrap">
        {suggestions.length > 0 && <SlashMenu items={suggestions} active={cursor} onHover={setCursor} onPick={pick} />}
        <input ref={fileInput} type="file" hidden onChange={(e) => e.target.files?.[0] && attachment.upload(e.target.files[0])} />
        <div className={`composer${busy ? " is-busy" : ""}${dictation.listening ? " is-listening" : ""}`}>
          {attachment.file && (
            <div className="composer__file">
              <FileText size={12} />
              <span>{attachment.file.name}</span>
              <IconButton size="sm" label="Remove attachment" onClick={attachment.clear}>
                <X size={11} />
              </IconButton>
            </div>
          )}
          <textarea
            ref={area}
            value={value}
            rows={1}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={dictation.listening ? "Listening. Click the mic again to stop." : "Ask the agent, or type / for commands"}
            aria-label="Message"
          />
          <div className="composer__bar">
            <IconButton size="sm" label="Attach a file" onClick={() => fileInput.current?.click()} disabled={attachment.uploading || busy}>
              {attachment.uploading ? <span className="ab-spinner" /> : <Paperclip size={15} />}
            </IconButton>
            <IconButton size="sm" label={dictation.listening ? "Stop recording" : "Dictate"} onClick={dictation.toggle} disabled={busy} className={dictation.listening ? "composer__mic-on" : undefined}>
              {dictation.listening ? <MicOff size={15} /> : <Mic size={15} />}
            </IconButton>
            {note ? (
              <span className="composer__note">{note}</span>
            ) : (
              <span className="composer__hint">
                <Kbd>↵</Kbd> send <Kbd>⇧↵</Kbd> new line
              </span>
            )}
            <IconButton label="Send" variant={canSend ? "primary" : "default"} className="composer__send" onClick={() => submit()} disabled={!canSend}>
              {busy ? <span className="ab-spinner" /> : <ArrowUp size={16} />}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}
