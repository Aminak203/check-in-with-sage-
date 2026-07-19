import { markFeedbackSubmitted } from "../utils/supabase";

// Shown once a user reaches 5 sessions. Google Forms can't notify us when the
// form is actually submitted, so "I've completed it" marks the profile so we
// stop prompting; "Maybe later" just dismisses for this login.
// Override per-environment with VITE_FEEDBACK_FORM_URL if the form ever changes.
const DEFAULT_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfNbEX9B6U146mrBiZkD5f4Pz0jgYulSp50P8-gOMMJbyGiqw/viewform";
const FORM_URL = import.meta.env.VITE_FEEDBACK_FORM_URL || DEFAULT_FORM_URL;

export default function FeedbackPrompt({ userId, onClose }) {
  const done = async () => {
    try {
      await markFeedbackSubmitted(userId);
    } catch (e) {
      console.error("Failed to mark feedback submitted:", e);
    }
    onClose();
  };

  return (
    <div className="feedback-overlay">
      <div className="feedback-card">
        <div className="feedback-icon">💬</div>
        <h2 className="feedback-title">You've done 5 check-ins with Sorra</h2>
        <p className="feedback-text">
          Thank you for giving Sorra a try. Would you take a couple of minutes to
          share how it's been for you? Your feedback shapes what we build next.
        </p>
        <div className="feedback-actions">
          {FORM_URL ? (
            <a
              className="feedback-btn primary"
              href={FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open the feedback form
            </a>
          ) : (
            <span className="feedback-note">Feedback form link not set yet.</span>
          )}
          <button className="feedback-btn" onClick={done}>
            I've completed it
          </button>
          <button className="feedback-link" onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
