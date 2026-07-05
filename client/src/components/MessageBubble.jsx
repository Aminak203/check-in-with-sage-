export default function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`message ${isUser ? "user" : "bot"}`}>
      <div className={`bubble ${isUser ? "user" : "bot"}`}>
        {message.content}
      </div>
    </div>
  );
}
