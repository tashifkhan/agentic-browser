import { Bot } from "../../icons";
import { useApi } from "../../query/provider";
import type { IntegrationsStatus } from "../../types/api";
import { SettingsSection as Section } from "../components";
import { SecretList, SubHeading } from "../parts";
import { CompactionForm } from "./CompactionForm";
import { ModelForm } from "./ModelForm";

export function ModelSection({ llm, defaultOpen }: { llm: IntegrationsStatus["llm"]; defaultOpen?: boolean }) {
  const { api } = useApi();
  return (
    <Section title="Model" icon={Bot} defaultOpen={defaultOpen} description={`${llm.effective.provider} / ${llm.effective.model}`}>
      <ModelForm current={llm.effective} providers={llm.providers_configured} onSave={api.llmSet} onReset={api.llmClear} saveLabel="Use this model" />
      <SubHeading>Chat titles</SubHeading>
      <ModelForm current={llm.chat_title} providers={llm.providers_configured} onSave={api.chatTitleLlmSet} onReset={api.chatTitleLlmClear} saveLabel="Use for titles" />
      <SubHeading>Long chats</SubHeading>
      <CompactionForm />
      <SubHeading>API keys and endpoints</SubHeading>
      <p className="set-muted">
        Point OpenAI, Anthropic or Google at any server that speaks its API with <code>openai_base_url</code> (ends in <code>/v1</code>),
        <code>anthropic_base_url</code> or <code>google_base_url</code>. The model lists then come from that server instead of models.dev.
      </p>
      <SecretList secrets={llm.secrets} />
    </Section>
  );
}
