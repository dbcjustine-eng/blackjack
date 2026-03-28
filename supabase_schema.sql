-- ══════════════════════════════════════════════════════════
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ══════════════════════════════════════════════════════════

-- Table des joueurs
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password text not null,       -- stocké en clair (app privée entre amis)
  tokens integer not null default 100,
  is_admin boolean not null default false,
  created_at timestamptz default now()
);

-- Désactive Row Level Security pour usage privé simple
alter table players disable row level security;

-- Compte admin par défaut (change le mot de passe !)
insert into players (username, password, tokens, is_admin)
values ('admin', 'admin123', 999999, true)
on conflict (username) do nothing;
