import { createClient } from '@supabase/supabase-js'

// ─── Canonical project: "SNT 10 Kupang EXAM" (asjgavgxbppauzykqqgv) ─────────
// Publishable keys are safe to ship in client bundles (access is enforced by RLS).
const DEFAULT_SUPABASE_URL = 'https://asjgavgxbppauzykqqgv.supabase.co'
const DEFAULT_SUPABASE_KEY = 'sb_publishable_t1Ye4udfVDBd8iSJZjQ9HQ_HpebFnks'

// NOTE: The legacy VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY variables are
// intentionally NOT read anymore. A stale copy of them on the Vercel deployment
// pointed the app at a different Supabase project, which made every login fail.
// To override the project, set these (new) variables instead:
const supabaseUrl = import.meta.env.VITE_BOLOS_SUPABASE_URL || DEFAULT_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_BOLOS_SUPABASE_KEY || DEFAULT_SUPABASE_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      }
    })
  : null

export default supabase
