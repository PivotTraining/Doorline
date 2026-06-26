// ============================================================
// Supabase client + DEMO switch.
// When both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are present,
// the app leaves demo mode and the store's write-through hooks go live.
// With no keys, DEMO is true and everything runs against localStorage.
// ============================================================
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const DEMO = !(url && anon);
export const supabase = DEMO ? null : createClient(url, anon);
