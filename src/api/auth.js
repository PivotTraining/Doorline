// Supabase Auth wrapper (live mode). Real auth swaps in here with no
// change to the component layer — they still just see `currentUser()`.
import { supabase } from "../supabaseClient";

export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
export const signOut = () => supabase.auth.signOut();
export const getSession = () => supabase.auth.getSession();
export const onAuth = (cb) => supabase.auth.onAuthStateChange(cb);

export async function myProfile() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).single();
  return data;
}
