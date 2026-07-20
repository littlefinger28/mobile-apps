import { createClient } from "@supabase/supabase-js";

// 1. Cria uma conta grátis em https://supabase.com
// 2. Cria um novo projeto (diferente do projeto do calendário)
// 3. Vai a Project Settings > API e copia o "Project URL" e a "anon public key"
// 4. Cola-os aqui em baixo
const SUPABASE_URL = "https://pqpiyvcoyjzyobjibipb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxcGl5dmNveWp6eW9iamliaXBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzA2NDEsImV4cCI6MjEwMDE0NjY0MX0.x2OLz3SmPU-BjzosCukHlTuquAGT8ZbX7SmuoImdOmI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});
