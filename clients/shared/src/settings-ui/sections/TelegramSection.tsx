import { useState } from "react";
import { Info, Send } from "../../icons";
import { Button, IconButton } from "../../ui/Button";
import { Pill } from "../../ui/Pill";
import { useApi } from "../../query/provider";
import type { TelegramBotPublic } from "../../types/api";
import { SettingsField as Field, SettingsModal as Modal, SettingsSection as Section, settingsInputStyle as inputStyle } from "../components";
import { Actions, MutationNote, SettingHead } from "../parts";
import { useSettingsMutation } from "../hooks";

export function TelegramSection({ telegram }: { telegram: TelegramBotPublic }) {
  const { api } = useApi();
  const [editing, setEditing] = useState(false);
  const [guide, setGuide] = useState(false);
  const [token, setToken] = useState("");
  const save = useSettingsMutation(() => api.secretSet("telegram_bot_token", token), () => {
    setEditing(false);
    setToken("");
  });
  const clear = useSettingsMutation(() => api.secretClear("telegram_bot_token"));
  const [users, setUsers] = useState((telegram.allowed_users ?? []).join(", "));
  const savedUsers = (telegram.allowed_users ?? []).join(", ");
  const saveUsers = useSettingsMutation(() =>
    users.trim() ? api.secretSet("telegram_allowed_users", users.replace(/\s+/g, "")) : api.secretClear("telegram_allowed_users"),
  );

  return (
    <Section title="Telegram bot" icon={Send} aside={<Pill tone={telegram.configured ? "ok" : "neutral"}>{telegram.configured ? "configured" : "not set"}</Pill>}>
      <div className="set-row">
        <SettingHead
          name="Bot token"
          info={<IconButton size="sm" label="How to get a token" onClick={() => setGuide(true)}><Info size={14} /></IconButton>}
          facts={[["token", telegram.token_masked ?? "-"], ["source", telegram.token_source]]}
        />
        <Actions>
          <Button size="sm" onClick={() => setEditing(true)}>{telegram.configured ? "Replace" : "Add token"}</Button>
          {telegram.token_source === "db" && <Button size="sm" variant="danger" loading={clear.isPending} onClick={() => clear.mutate()}>Remove</Button>}
        </Actions>
      </div>

      <div className="set-row">
        <Field
          label="Allowed users"
          hint="Telegram user ids, comma-separated. Send /whoami to the bot to get yours. Only these users can use the bot, and they can run browser tasks and Composio actions from their phone. Empty means anyone can ask questions and nobody can act."
        >
          <input value={users} onChange={(e) => setUsers(e.target.value)} placeholder="123456789" inputMode="numeric" style={inputStyle} />
        </Field>
        {users.replace(/\s+/g, "") !== savedUsers.replace(/\s+/g, "") && (
          <Actions>
            <Button size="sm" variant="primary" loading={saveUsers.isPending} onClick={() => saveUsers.mutate()}>Save</Button>
            <MutationNote m={saveUsers} />
          </Actions>
        )}
      </div>

      {guide && (
        <Modal title="Get a Telegram bot token" onClose={() => setGuide(false)}>
          <ol className="set-steps">
            <li>Open <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> in Telegram.</li>
            <li>Send <code>/newbot</code>, then pick a display name and a username ending in <code>bot</code>.</li>
            <li>Copy the token it replies with, something like <code>123456:ABC-DEF…</code>.</li>
            <li>Paste it here. The bot starts with the server, or right away if the server is running.</li>
          </ol>
          <p className="set-muted">Each message starts a new conversation. Replying to a bot message continues that thread.</p>
        </Modal>
      )}

      {editing && (
        <Modal title="Telegram bot token" onClose={() => setEditing(false)}>
          <form className="set-form" onSubmit={(e) => { e.preventDefault(); if (token) save.mutate(); }}>
            <Field label="Token" hint="Stored encrypted in the database.">
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the token from @BotFather" style={inputStyle} autoFocus />
            </Field>
            <div className="set-actions set-actions--end">
              <MutationNote m={save} />
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!token} loading={save.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </Section>
  );
}
