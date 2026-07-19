import { createClient } from "@supabase/supabase-js";

// The URL + anon key are safe to ship in the client: Row Level Security (see
// supabase/schema.sql) is what actually protects the data. Set these in
// client/.env as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (and in Vercel's
// project env vars for production).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// persistSession:false → a page refresh requires logging in again, which keeps
// "one session = one login" clean and avoids inflating the count on reload.
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: true } })
  : null;

// ---- auth ------------------------------------------------------------------
export async function signUp({ name, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } }, // -> profiles.name via the signup trigger
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

// ---- sessions / profile ----------------------------------------------------
// Called once per login. Inserts a new session row (a "session" = one login)
// and returns the row plus how many sessions this user now has in total.
export async function startSession(userId) {
  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ user_id: userId })
    .select()
    .single();
  if (error) throw error;

  const { count } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  return { session, sessionCount: count ?? 0 };
}

// Fetch this user's earlier sessions (most recent first), excluding the current
// one, for cross-session memory recall. RLS ensures only their own rows return.
export async function getPastSessions(userId, excludeSessionId, limit = 5) {
  let query = supabase
    .from("sessions")
    .select("id, transcript, summary, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (excludeSessionId) query = query.neq("id", excludeSessionId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Store the generated recap on a session row.
export async function saveSummary(sessionId, summary) {
  if (!sessionId) return;
  await supabase.from("sessions").update({ summary }).eq("id", sessionId);
}

// Persist the running conversation onto the current session row.
export async function saveTranscript(sessionId, transcript) {
  if (!sessionId) return;
  await supabase
    .from("sessions")
    .update({ transcript, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
}

export async function getProfile(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("name, feedback_submitted")
    .eq("id", userId)
    .single();
  return data;
}

export async function markFeedbackSubmitted(userId) {
  await supabase.from("profiles").update({ feedback_submitted: true }).eq("id", userId);
}
