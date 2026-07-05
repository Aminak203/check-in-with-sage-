const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ITERATIONS = 100000;

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(data, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  const result = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  result.set(salt, 0);
  result.set(iv, SALT_LENGTH);
  result.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);
  return btoa(String.fromCharCode(...result));
}

export async function decryptData(encryptedBase64, passphrase) {
  const binary = Uint8Array.from(atob(encryptedBase64), (c) =>
    c.charCodeAt(0)
  );
  const salt = binary.slice(0, SALT_LENGTH);
  const iv = binary.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = binary.slice(SALT_LENGTH + IV_LENGTH);
  const key = await deriveKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decrypted));
}

export function clearStoredData() {
  localStorage.removeItem("mabel_session");
  localStorage.removeItem("mabel_created");
}

export function getStoredData() {
  const encrypted = localStorage.getItem("mabel_session");
  const created = localStorage.getItem("mabel_created");
  return encrypted ? { encrypted, created } : null;
}

export function saveStoredData(encryptedBase64) {
  localStorage.setItem("mabel_session", encryptedBase64);
  localStorage.setItem("mabel_created", Date.now().toString());
}
