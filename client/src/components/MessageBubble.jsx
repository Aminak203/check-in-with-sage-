export default function MessageBubble({ message, progress }) {
  const isUser = message.role === "user";

  // While an assistant message is being spoken, `progress` (0..1) reveals the
  // words in step with the voice. Absent, null, or >= 1 shows the full text.
  let content = message.content;
  if (!isUser && typeof progress === "number" && progress < 1) {
    const words = message.content.split(" ");
    const shown = Math.max(1, Math.ceil(progress * words.length));
    content = words.slice(0, shown).join(" ");
  }

  return (
    <div className={`message ${isUser ? "user" : "bot"}`}>
      <div className={`bubble ${isUser ? "user" : "bot"}`}>
        {content}
      </div>
    </div>
  );
}
