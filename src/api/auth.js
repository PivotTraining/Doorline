// Supabase Auth wrapper (live mode). Real auth swaps in here with no
// change to the component layer — they still just see `currentUser()`.
import { supabase } from "../supabaseClient";

export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
// New org signup: the DB trigger (see migration 0010) provisions the
// organization + owner profile server-side once this auth user is created.
export const signUp = (email, password, fullName, orgName, inviteToken = null) =>
  supabase.auth.signUp({ email, password, options: { data: {
    full_name: fullName, org_name: orgName,
    ...(inviteToken ? { doorline_invite: inviteToken } : {}),
  } } });

// Company identity comes from the server-validated, expiring invitation,
// never from an editable URL company ID or a signup form field.
export async function invitedCompanyName(token) {
  if (!token || !supabase) return null;
  const { data, error } = await supabase.rpc("invited_company_name", { p_token: token });
  if (error) throw error;
  return data || null;
}

export async function issueCompanyInvite() {
  const { data, error } = await supabase.rpc("create_company_invite", { p_max_uses: 25, p_expires_days: 14 });
  if (error) throw error;
  return data;
}
export const signOut = () => supabase.auth.signOut();
export const getSession = () => supabase.auth.getSession();
export const onAuth = (cb) => supabase.auth.onAuthStateChange(cb);

export async function myProfile() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).single();
  return data;
}
