import { useEffect, useState } from "react";
import { Button } from "../../ui/Button";
import { Pill } from "../../ui/Pill";
import { SimpleSelect } from "../../ui/Select";
import type { LLMEffective } from "../../types/api";
import { SettingsField as Field, settingsInputStyle as inputStyle } from "../components";
import { MutationNote } from "../parts";
import { useSettingsMutation } from "../hooks";

type Payload = { provider: string; model: string; temperature: number };

/** Provider, model and temperature for one LLM role (chat or titles). */
export function ModelForm({
  current,
  providers,
  onSave,
  onReset,
  saveLabel,
}: {
  current: LLMEffective;
  providers: Record<string, boolean>;
  onSave: (p: Payload) => Promise<unknown>;
  onReset: () => Promise<unknown>;
  saveLabel: string;
}) {
  const [provider, setProvider] = useState(current.provider);
  const [model, setModel] = useState(current.model);
  const [temperature, setTemperature] = useState(String(current.temperature ?? 0.4));

  useEffect(() => {
    setProvider(current.provider);
    setModel(current.model);
    setTemperature(String(current.temperature ?? 0.4));
  }, [current.provider, current.model, current.temperature]);

  const save = useSettingsMutation(() => onSave({ provider, model, temperature: parseFloat(temperature) || 0 }));
  const reset = useSettingsMutation(onReset);
  const dirty = provider !== current.provider || model !== current.model || String(current.temperature) !== temperature;

  return (
    <div className="set-model">
      <div className="set-model__now">
        <Pill tone={current.source === "db" ? "ok" : "neutral"}>{current.source === "db" ? "custom" : "default"}</Pill>
        <code>{current.provider}/{current.model}</code>
        <span className="set-model__t">t={current.temperature}</span>
      </div>
      <div className="set-grid set-grid--model">
        <Field label="Provider">
          <SimpleSelect
            label="Provider"
            value={provider}
            onChange={setProvider}
            options={Object.keys(providers).map((p) => ({ value: p, label: p, hint: providers[p] ? undefined : "no key" }))}
          />
        </Field>
        <Field label="Model">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gemini-2.5-flash" style={{ ...inputStyle, fontFamily: "var(--font-code)" }} />
        </Field>
        <Field label="Temperature">
          <input value={temperature} onChange={(e) => setTemperature(e.target.value)} inputMode="decimal" style={inputStyle} />
        </Field>
      </div>
      <div className="set-actions">
        {(dirty || save.isPending) && (
          <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate()}>{saveLabel}</Button>
        )}
        {current.source === "db" && (
          <Button size="sm" variant="ghost" loading={reset.isPending} onClick={() => reset.mutate()}>Reset to default</Button>
        )}
        <MutationNote m={save} />
        <MutationNote m={reset} />
      </div>
    </div>
  );
}
