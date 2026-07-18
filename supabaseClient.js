import { createClient } from "@supabase/supabase-js";

// 1. Cria uma conta grátis em https://supabase.com
// 2. Cria um novo projeto
// 3. Vai a Project Settings > API e copia o "Project URL" e a "anon public key"
// 4. Cola-os aqui em baixo
const SUPABASE_URL = "https://ptucosmrvjklyyhmkfjg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0dWNvc21ydmprbHl5aG1rZmpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMTM1MzcsImV4cCI6MjA5OTg4OTUzN30.sg81pZEdWsi0WVSqCQGYRibnwRqYeODdup50pD1oMi4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});
