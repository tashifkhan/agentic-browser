interface ApiKeySectionProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  onSave: () => void;
}

export function ApiKeySection({
  apiKey,
  setApiKey,
  onSave,
}: ApiKeySectionProps) {
  return (
    <section className="api-key-section">
      <h3>API Key</h3>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Enter Gemini API key"
      />
      <button onClick={onSave}>Save</button>
    </section>
  );
}
