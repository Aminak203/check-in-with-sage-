const EMOJIS = ["🙂", "😐", "😒", "😔", "😟", "😕", "😣", "😖", "😫", "😭"];

export default function DistressScale({ onSelect, onClose }) {
  const handleSelect = (value) => {
    onSelect(value);
  };

  return (
    <div className="message bot">
      <div className="bubble distress-bubble">
        <div className="distress-label">How distressed do you feel right now?</div>
        <div className="distress-scale">
          {EMOJIS.map((emoji, index) => (
            <button
              key={index}
              className="distress-btn"
              onClick={() => handleSelect(index + 1)}
              aria-label={`Rate distress ${index + 1}`}
            >
              <span className="distress-emoji">{emoji}</span>
              <span className="distress-number">{index + 1}</span>
            </button>
          ))}
        </div>
        <button className="distress-skip" onClick={onClose}>
          or type it yourself
        </button>
      </div>
    </div>
  );
}
