-- Corre este script no Supabase: Project > SQL Editor > New query > Run

create table if not exists dias_estado (
  clave text primary key,
  estado text not null
);

create table if not exists vacaciones (
  anio int primary key,
  valor int not null
);

create table if not exists gastos (
  id text primary key,
  cuenta text,
  tipo text,
  valor numeric,
  dia text,
  nota text,
  imagen text,
  archivado boolean default false,
  created_at timestamptz default now()
);

alter table dias_estado enable row level security;
alter table vacaciones enable row level security;
alter table gastos enable row level security;

-- Como a app não tem login de utilizador, permitimos acesso total com a
-- chave "anon" (só quem tiver o link/app consegue aceder aos dados).
create policy "allow all dias_estado" on dias_estado for all using (true) with check (true);
create policy "allow all vacaciones" on vacaciones for all using (true) with check (true);
create policy "allow all gastos" on gastos for all using (true) with check (true);

-- Ativar realtime (sincronização automática entre dispositivos)
alter publication supabase_realtime add table dias_estado;
alter publication supabase_realtime add table gastos;

-- Depois corre isto no Storage (Project > Storage > New bucket):
-- nome: fotos
-- Public bucket: SIM (ativado)
