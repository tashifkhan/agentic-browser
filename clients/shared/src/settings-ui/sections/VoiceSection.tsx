import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mic } from "../../icons";
import { Button } from "../../ui/Button";
import { SimpleSelect } from "../../ui/Select";
import { useApi } from "../../query/provider";
import { useQueries } from "../../query/hooks";
import type { IntegrationsStatus, VoiceConfigPublic } from "../../types/api";
import { SettingsField as Field, SettingsSection as Section, settingsInputStyle as inputStyle } from "../components";
import { MutationNote, SecretList, SubHeading, Toggle } from "../parts";
import { useSettingsMutation } from "../hooks";

const STT = [
  ["whisper_local", "Whisper (local)"],
  ["openai", "OpenAI"],
  ["groq", "Groq"],
] as const;
const TTS = [
  ["browser_native", "Browser voice"],
  ["openai", "OpenAI"],
  ["elevenlabs", "ElevenLabs"],
  ["cartesia", "Cartesia"],
] as const;

/**
 * Speech in and out. After every save it fires `voice-config-updated` on
 * window with the fresh config, which the voice controls listen for.
 */
export function VoiceSection({ voice }: { voice: IntegrationsStatus["voice"] }) {
  const { api } = useApi();
  const qc = useQueryClient();
  const integrations = useQueries().integrations();
  const [local, setLocal] = useState<VoiceConfigPublic>(voice.effective);

  useEffect(() => setLocal(voice.effective), [voice.effective]);

  const announce = async () => {
    const fresh = await qc.fetchQuery({ ...integrations, staleTime: 0 });
    const next = fresh?.voice?.effective;
    if (next) {
      setLocal(next);
      window.dispatchEvent(new CustomEvent("voice-config-updated", { detail: next }));
    }
  };

  const save = useSettingsMutation((next: VoiceConfigPublic) => api.voiceSet(next), announce);
  const reset = useSettingsMutation(() => api.voiceClear(), announce);

  const patch = (p: Partial<VoiceConfigPublic>) => {
    const next = { ...local, ...p };
    setLocal(next);
    save.mutate(next);
  };

  return (
    <Section title="Voice" icon={Mic} description={`${local.stt_provider} in, ${local.tts_provider} out`}>
      <div className="set-grid">
        <Field label="Speech to text">
          <SimpleSelect label="Speech to text" value={local.stt_provider} onChange={(v) => patch({ stt_provider: v })} options={STT.map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="Model">
          <input value={local.stt_model ?? ""} onChange={(e) => setLocal({ ...local, stt_model: e.target.value })} onBlur={(e) => e.target.value !== voice.effective.stt_model && patch({ stt_model: e.target.value })} style={{ ...inputStyle, fontFamily: "var(--font-code)" }} />
        </Field>
        <Field label="Text to speech">
          <SimpleSelect label="Text to speech" value={local.tts_provider} onChange={(v) => patch({ tts_provider: v })} options={TTS.map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="Voice">
          <input value={local.tts_voice ?? ""} placeholder="Voice id or name" onChange={(e) => setLocal({ ...local, tts_voice: e.target.value })} onBlur={(e) => e.target.value !== voice.effective.tts_voice && patch({ tts_voice: e.target.value })} style={{ ...inputStyle, fontFamily: "var(--font-code)" }} />
        </Field>
      </div>
      <div className="set-toggles">
        <Toggle checked={!!local.auto_submit} onChange={(v) => patch({ auto_submit: v })} label="Send automatically when I stop talking" />
        <Toggle checked={!!local.auto_speak} onChange={(v) => patch({ auto_speak: v })} label="Read replies aloud" />
      </div>
      <div className="set-actions">
        <MutationNote m={save} />
        <MutationNote m={reset} />
        {voice.effective.source === "db" && (
          <Button size="sm" variant="ghost" loading={reset.isPending} onClick={() => reset.mutate()}>Reset to defaults</Button>
        )}
      </div>
      {voice.secrets.length > 0 && (
        <>
          <SubHeading>Voice API keys</SubHeading>
          <SecretList secrets={voice.secrets} />
        </>
      )}
    </Section>
  );
}
