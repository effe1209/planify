-- Planify cloud: progetti per utente e link di condivisione in sola lettura.
-- Si applica una volta dal pannello Supabase (SQL Editor) o con `supabase db push`.

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default '',
  data        jsonb not null,                       -- piani, impianti, preventivo (lo stesso formato del link di condivisione)
  share_token text unique,                          -- vuoto = non condiviso; chi ha il token vede il progetto senza account
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_owner_updated_idx on public.projects (owner, updated_at desc);

alter table public.projects enable row level security;

-- ognuno vede, crea, modifica ed elimina solo i propri progetti
create policy "projects_select_own" on public.projects for select to authenticated using (owner = (select auth.uid()));
create policy "projects_insert_own" on public.projects for insert to authenticated with check (owner = (select auth.uid()));
create policy "projects_update_own" on public.projects for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "projects_delete_own" on public.projects for delete to authenticated using (owner = (select auth.uid()));

-- aggiorna updated_at a ogni modifica
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

-- il link in sola lettura: dato il token si legge solo quel progetto, nient'altro (la tabella resta chiusa agli anonimi)
create or replace function public.get_shared_project(token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object('name', p.name, 'data', p.data, 'updated_at', p.updated_at)
  from public.projects p
  where p.share_token is not null and p.share_token = token
  limit 1
$$;

revoke all on function public.get_shared_project(text) from public;
grant execute on function public.get_shared_project(text) to anon, authenticated;
