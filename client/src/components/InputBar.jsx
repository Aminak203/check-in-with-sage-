import { useState, useRef, useEffect } from "react";

export default function InputBar({ onSend, disabled, prefillText }) {
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [disabled]);

  useEffect(() => {
    if (prefillText !== undefined && prefillText !== null) {
      setText(prefillText);
      inputRef.current?.focus();
    }
  }, [prefillText]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim() && !disabled) {
      onSend(text.trim());
      setText("");
    }
  };

  return (
    <form className="input-bar" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a message..."
        disabled={disabled}
        autoFocus
      />
      <button type="submit" disabled={disabled || !text.trim()}>
        ➤
      </button>
    </form>
  );
}
