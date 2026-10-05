import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://asjgavgxbppauzykqqgv.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzamdhdmd4YnBwYXV6eWtxcWd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNDQxOTQsImV4cCI6MjEwNjcyMDE5NH0.jPYUycD-XL3daItCQtdAv_cYFqBdopxf3NGGWW5MXRE'

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
