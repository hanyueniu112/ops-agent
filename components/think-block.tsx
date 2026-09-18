"use client";

export function LiveDots() {
  return (
    <span className="live-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function lastSnippet(text: string) {
  const line = text.trim().split("\n").filter(Boolean).at(-1) || "";
  return line.replace(/\s+/g, " ").trim();
}

export function ThinkBlock({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  if (!text.trim() && !streaming) return null;
  const snippet = lastSnippet(text);

  return (
    <details className={`think-block ${streaming ? "is-live" : ""}`}>
      <summary>
        <span>Think</span>
        {streaming ? <LiveDots /> : null}
        {streaming && snippet ? <span className="live-snippet">{snippet}</span> : null}
      </summary>
      {text.trim() ? <div className="think-body">{text}</div> : null}
    </details>
  );
}
