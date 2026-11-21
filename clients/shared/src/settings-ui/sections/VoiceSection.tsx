import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic } from "../../icons";
import { Button } from "../../ui/Button";
import { Segmented } from "../../ui/Segmented";
import { SimpleSelect } from "../../ui/Select";
import { queryKeys } from "../../query/keys";
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
  ["xai", "xAI"],
  ["openrouter", "OpenRouter"],
  ["custom", "OpenAI-compatible server"],
] as const;
const ONE_PASS = [
  ["google", "Google (Gemini)"],
  ["openai", "OpenAI (gpt-audio)"],
  ["openrouter", "OpenRouter"],
] as const;
const MODES = [
  { value: "transcribe", label: "Transcribe" },
  { value: "one_pass", label: "One pass" },
] as const;

/** A text field with suggestions, saved when it loses focus. */
function ModelInput({ value, options, onSave, placeholder }: { value: string; options: string[]; onSave: (v: string) => void; placeholder?: string }) {
  const id = useId();
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <>
      <input value={v} list={id} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} style={{ ...inputStyle, fontFamily: "var(--font-code)" }} />
      <datalist id={id}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}
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
  const { api, baseUrl } = useApi();
  const models = useQuery({ queryKey: queryKeys.voiceModels(baseUrl), queryFn: api.voiceModels, staleTime: 30 * 60_000 });
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
    <Section title="Voice" icon={Mic} description={`${local.stt_mode === "one_pass" ? `one pass on ${local.one_pass_model}` : local.stt_provider} in, ${local.tts_provider} out`}>
      <SubHeading>Speech in</SubHeading>
      <div className="set-row">
        <Segmented size="sm" label="Voice route" value={local.stt_mode ?? "transcribe"} options={[...MODES]} onChange={(v) => patch({ stt_mode: v })} />
      </div>
      <p className="set-muted">
        {(local.stt_mode ?? "transcribe") === "one_pass"
          ? "The recording goes to a model that hears audio and comes back as finished text in one request: filler gone, corrections applied, nothing answered."
          : "A speech-to-text model writes down what you said. Turn on cleanup to tidy it with the default chat model afterwards."}
      </p>
      <div className="set-grid">
        {(local.stt_mode ?? "transcribe") === "one_pass" ? (
          <>
            <Field label="Provider">
              <SimpleSelect label="One-pass provider" value={local.one_pass_provider ?? "google"} onChange={(v) => patch({ one_pass_provider: v, one_pass_model: models.data?.one_pass[v]?.[0] ?? "" })} options={ONE_PASS.map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="Model (hears audio)">
              <ModelInput value={local.one_pass_model ?? ""} options={models.data?.one_pass[local.one_pass_provider ?? "google"] ?? []} onSave={(v) => patch({ one_pass_model: v })} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Speech to text">
              <SimpleSelect label="Speech to text" value={local.stt_provider} onChange={(v) => patch({ stt_provider: v, stt_model: models.data?.transcribe[v]?.[0] ?? "" })} options={STT.map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="Model">
              <ModelInput value={local.stt_model ?? ""} options={models.data?.transcribe[local.stt_provider] ?? []} onSave={(v) => patch({ stt_model: v })} />
            </Field>
            {local.stt_provider === "custom" && (
              <Field label="Server URL (ends in /v1)">
                <ModelInput value={local.stt_base_url ?? ""} options={[]} placeholder="http://localhost:8000/v1" onSave={(v) => patch({ stt_base_url: v })} />
              </Field>
            )}
          </>
        )}
        <Field label="Language (blank: detect)">
          <ModelInput value={local.stt_language ?? ""} options={["en", "hi", "es", "fr", "de", "ja"]} placeholder="auto" onSave={(v) => patch({ stt_language: v })} />
        </Field>
      </div>
      <div className="set-toggles">
        {(local.stt_mode ?? "transcribe") === "transcribe" && (
          <Toggle checked={!!local.stt_cleanup} onChange={(v) => patch({ stt_cleanup: v })} label="Clean up the transcript (filler, corrections, punctuation)" />
        )}
        <Toggle checked={local.stt_fallback_local !== false} onChange={(v) => patch({ stt_fallback_local: v })} label="Fall back to local Whisper if the cloud call fails" />
      </div>

      <SubHeading>Speech out</SubHeading>
      <div className="set-grid">
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
