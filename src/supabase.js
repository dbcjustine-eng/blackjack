import { createClient } from '@supabase/supabase-js'

// 👇 Tu remplaces ces deux valeurs avec celles de ton projet Supabase
// (Settings → API dans le dashboard Supabase)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
