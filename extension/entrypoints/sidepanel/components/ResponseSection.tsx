interface ResponseSectionProps {
  response: string;
}

export function ResponseSection({ response }: ResponseSectionProps) {
  if (!response) return null;

  return (
    <section className="response-section">
      <h3>Response</h3>
      <div className="response-box">{response}</div>
    </section>
  );
}
