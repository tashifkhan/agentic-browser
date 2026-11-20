import { Bot } from "../../icons";
import { useApi } from "../../query/provider";
import type { IntegrationsStatus } from "../../types/api";
import { SettingsSection as Section } from "../components";
import { SecretList, SubHeading } from "../parts";
import { ModelForm } from "./ModelForm";

export function ModelSection({ llm, defaultOpen }: { llm: IntegrationsStatus["llm"]; defaultOpen?: boolean }) {
  const { api } = useApi();
  return (
    <Section title="Model" icon={Bot} defaultOpen={defaultOpen} description={`${llm.effective.provider} / ${llm.effective.model}`}>
      <ModelForm current={llm.effective} providers={llm.providers_configured} onSave={api.llmSet} onReset={api.llmClear} saveLabel="Use this model" />
      <SubHeading>Chat titles</SubHeading>
      <ModelForm current={llm.chat_title} providers={llm.providers_configured} onSave={api.chatTitleLlmSet} onReset={api.chatTitleLlmClear} saveLabel="Use for titles" />
      <SubHeading>API keys</SubHeading>
      <SecretList secrets={llm.secrets} />
    </Section>
  );
}
