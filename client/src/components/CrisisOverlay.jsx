export default function CrisisOverlay({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="crisis-overlay">
      <div className="crisis-modal">
        <div className="crisis-header">
          <span className="crisis-icon">🆘</span>
          <h2>You're Not Alone</h2>
        </div>
        <p className="crisis-message">
          If you're in crisis or feeling like you might hurt yourself, please
          reach out to one of these free, confidential support services
          available now:
        </p>
        <div className="crisis-contacts">
          <a href="tel:116123" className="crisis-contact">
            <span className="contact-name">Samaritans</span>
            <span className="contact-number">116 123</span>
            <span className="contact-desc">Free, 24 hours a day</span>
          </a>
          <a href="tel:08088081111" className="crisis-contact">
            <span className="contact-name">MIND In Crisis</span>
            <span className="contact-number">0808 808 1111</span>
            <span className="contact-desc">Free, 24 hours a day</span>
          </a>
          <a className="crisis-contact">
            <span className="contact-name">Text SHOUT</span>
            <span className="contact-number">85258</span>
            <span className="contact-desc">Free, 24 hours a day</span>
          </a>
        </div>
        <button className="crisis-close" onClick={onClose}>
          I understand
        </button>
      </div>
    </div>
  );
}
