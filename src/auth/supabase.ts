/**
 * Supabase Auth as a password provider (D-022). Server-side only: it holds the
 * service-role key, which must never reach a browser. Accounts are made through
 * the admin API already confirmed, so no email is ever sent.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PasswordProvider } from "./password";

let client: SupabaseClient | undefined;

function admin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  // No session is kept here; DALAA's own cookie is the session.
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export const supabasePasswords: PasswordProvider = {
  async verify(email, password) {
    const { data, error } = await admin().auth.signInWithPassword({ email, password });
    // Only a wrong email/password is a "no"; anything else (Supabase down) is an error, not a refusal.
    if (error && error.code !== "invalid_credentials" && error.status !== 400) throw error;
    return data.user?.email?.toLowerCase() === email;
  },

  async create(email, password) {
    const { error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
    if (!error) return "created";
    if (error.code === "email_exists" || error.code === "user_already_exists") return "exists";
    if (error.code === "weak_password") return "weak";
    throw error;
  },

  async setPassword(email, password) {
    const made = await supabasePasswords.create(email, password);
    if (made !== "exists") return made === "created" ? "set" : "weak";
    const id = await findUserId(email);
    if (!id) throw new Error("Supabase says the email exists but no user has it");
    const { error } = await admin().auth.admin.updateUserById(id, { password, email_confirm: true });
    if (!error) return "set";
    if (error.code === "weak_password") return "weak";
    throw error;
  },
};

/** The admin API can't look a user up by email, so page through them. Pilot-sized. */
async function findUserId(email: string): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < perPage) return null;
  }
}
