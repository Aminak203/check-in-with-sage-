import { useState } from "react";
import { encryptData, decryptData, getStoredData, saveStoredData, clearStoredData } from "../utils/crypto";

export default function LockScreen({ onUnlock }) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const existing = getStoredData();

  const handleCreate = async () => {
    if (passphrase.length < 4) {
      setError("Passphrase must be at least 4 characters");
      return;
    }
    if (passphrase !== confirm) {
      setError("Passphrases do not match");
      return;
    }
    setLoading(true);
    try {
      const encrypted = await encryptData([], passphrase);
      saveStoredData(encrypted);
      onUnlock([], passphrase);
    } catch {
      setError("Failed to create session");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!existing) return;
    setLoading(true);
    try {
      const session = await decryptData(existing.encrypted, passphrase);
      onUnlock(session, passphrase);
    } catch {
      setError("Incorrect passphrase");
      setPassphrase("");
    } finally {
      setLoading(false);
    }
  };

  const handleWipe = async () => {
    if (!existing) return;
    if (!passphrase) {
      setError("Enter your passphrase to confirm");
      return;
    }
    try {
      await decryptData(existing.encrypted, passphrase);
      if (
        window.confirm(
          "This will permanently delete all session data. This cannot be undone."
        )
      ) {
        clearStoredData();
        setIsNew(true);
        setPassphrase("");
        setConfirm("");
        setError("");
      }
    } catch {
      setError("Incorrect passphrase");
      setPassphrase("");
    }
  };

  const createMode = isNew || !existing;

  return (
    <div className="lock-overlay">
      <div className="lock-card">
        <div className="lock-icon">🔒</div>
        <h2 className="lock-title">
          {createMode ? "Create a Secure Session" : "Unlock Your Session"}
        </h2>
        <p className="lock-subtitle">
          {createMode
            ? "Create a passphrase to encrypt and save your session. This is the only way to recover your data."
            : "Enter your passphrase to decrypt your session history."}
        </p>

        {createMode ? (
          <div className="lock-fields">
            <input
              type="password"
              placeholder="Enter passphrase"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <input
              type="password"
              placeholder="Confirm passphrase"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
        ) : (
          <div className="lock-fields">
            <input
              type="password"
              placeholder="Enter your passphrase"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              autoFocus
            />
          </div>
        )}

        {error && <div className="lock-error">{error}</div>}

        <div className="lock-actions">
          {createMode ? (
            <button
              className="lock-btn primary"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? "Encrypting..." : "Create Session"}
            </button>
          ) : (
            <button
              className="lock-btn primary"
              onClick={handleUnlock}
              disabled={loading}
            >
              {loading ? "Decrypting..." : "Unlock"}
            </button>
          )}
        </div>

        {!createMode && (
          <div className="lock-footer">
            <button
              className="lock-link"
              onClick={() => {
                setIsNew(true);
                setPassphrase("");
                setConfirm("");
                setError("");
              }}
            >
              Start a new session
            </button>
            <button className="lock-link danger" onClick={handleWipe}>
              Wipe stored data
            </button>
          </div>
        )}

        <div className="lock-info">
          All data is encrypted on your device with AES-256-GCM.
          <br />
          Nothing is stored on any server.
        </div>
      </div>
    </div>
  );
}
