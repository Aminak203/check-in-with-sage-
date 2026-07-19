import { useState } from "react";
import { signIn, signUp, isSupabaseConfigured } from "../utils/supabase";

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  // When email confirmation is required, we show a dedicated "check your inbox"
  // screen (clearer than a small notice the user can miss).
  const [confirmSent, setConfirmSent] = useState(false);

  const signupMode = mode === "signup";

  const submit = async () => {
    setError("");
    setNotice("");
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    if (signupMode && !name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (signupMode && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      if (signupMode) {
        const data = await signUp({ name: name.trim(), email, password });
        // If email confirmation is on, there's no session yet — send the user to
        // the "confirm your email" screen so they know the next step.
        if (data.session && data.user) {
          onAuth(data.user);
        } else {
          setConfirmSent(true);
        }
      } else {
        const data = await signIn({ email, password });
        onAuth(data.user);
      }
    } catch (e) {
      const msg = e?.message || "";
      // Supabase returns "Email not confirmed" when they haven't clicked the link.
      if (/not confirmed|confirm/i.test(msg)) {
        setError(
          "Please confirm your email first — open the link we sent to your inbox (check spam too), then log in."
        );
      } else {
        setError(msg || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="lock-overlay">
        <div className="lock-card">
          <div className="lock-icon">🌿</div>
          <h2 className="lock-title">Setup needed</h2>
          <p className="lock-subtitle">
            Supabase isn't configured yet. Add <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> to <code>client/.env</code> and reload.
          </p>
        </div>
      </div>
    );
  }

  if (confirmSent) {
    return (
      <div className="lock-overlay">
        <div className="lock-card">
          <div className="lock-icon">✉️</div>
          <h2 className="lock-title">Confirm your email</h2>
          <p className="lock-subtitle">
            We've sent a confirmation link to <strong>{email}</strong>. Open it to
            activate your account, then come back here to log in.
          </p>
          <div className="lock-info">
            Didn't get it? It can take a minute — and do check your spam or junk folder.
          </div>
          <div className="lock-actions">
            <button
              className="lock-btn primary"
              onClick={() => {
                setConfirmSent(false);
                setMode("login");
                setPassword("");
                setNotice("You can log in once you've confirmed your email.");
              }}
            >
              Back to log in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lock-overlay">
      <div className="lock-card">
        <div className="lock-icon">🌿</div>
        <h2 className="lock-title">
          {signupMode ? "Create your account" : "Welcome back"}
        </h2>
        <p className="lock-subtitle">
          {signupMode
            ? "Sign up to check in with Sova. You'll confirm your email, then log in."
            : "Log in to continue your check-ins with Sova."}
        </p>

        <div className="lock-fields">
          {signupMode && (
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoFocus
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus={!signupMode}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            autoComplete={signupMode ? "new-password" : "current-password"}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        {error && <div className="lock-error">{error}</div>}
        {notice && <div className="lock-info">{notice}</div>}

        <div className="lock-actions">
          <button className="lock-btn primary" onClick={submit} disabled={loading}>
            {loading
              ? signupMode
                ? "Creating account..."
                : "Logging in..."
              : signupMode
              ? "Create account"
              : "Log in"}
          </button>
        </div>

        <div className="lock-footer">
          <button
            className="lock-link"
            onClick={() => {
              setMode(signupMode ? "login" : "signup");
              setError("");
              setNotice("");
            }}
          >
            {signupMode ? "Already have an account? Log in" : "New here? Create an account"}
          </button>
        </div>

        {signupMode && (
          <div className="lock-info">
            By signing up you agree that your check-in conversations are stored
            securely to support your care. You can request deletion at any time.
          </div>
        )}
      </div>
    </div>
  );
}
