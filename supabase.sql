-- STEAL AN AIM: esquema inicial para Supabase
-- Ejecuta TODO este archivo en Supabase > SQL Editor > New query.
-- Después activa Anonymous Sign-Ins en Authentication > Sign In / Providers.

create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Player',
  coins bigint not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.aims (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players(id) on delete cascade,
  aim_type text not null check (aim_type in ('common','rare','epic','legendary')),
  income bigint not null,
  created_at timestamptz not null default now()
);

alter table public.players enable row level security;
alter table public.aims enable row level security;

drop policy if exists "players can be read by everyone" on public.players;
create policy "players can be read by everyone" on public.players for select using (true);
drop policy if exists "aims can be read by everyone" on public.aims;
create policy "aims can be read by everyone" on public.aims for select using (true);

revoke insert, update, delete on public.players from anon, authenticated;
revoke insert, update, delete on public.aims from anon, authenticated;
grant select on public.players, public.aims to anon, authenticated;

create or replace function public.join_game(player_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero.'; end if;
  insert into public.players (id, name, coins)
  values (auth.uid(), left(coalesce(player_name, 'Player'), 24), 100)
  on conflict (id) do nothing;
end;
$$;

create or replace function public.buy_aim(aim_type_input text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  price bigint;
  earn bigint;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero.'; end if;
  select case aim_type_input
    when 'common' then 25
    when 'rare' then 100
    when 'epic' then 350
    when 'legendary' then 1000
    else null end
  into price;
  select case aim_type_input
    when 'common' then 2
    when 'rare' then 8
    when 'epic' then 25
    when 'legendary' then 80
    else null end
  into earn;
  if price is null then raise exception 'Tipo de aim no válido.'; end if;
  update public.players set coins = coins - price
    where id = auth.uid() and coins >= price;
  if not found then raise exception 'No tienes suficientes monedas.'; end if;
  insert into public.aims(owner_id, aim_type, income)
    values (auth.uid(), aim_type_input, earn) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.steal_aim(target_aim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_owner uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero.'; end if;
  select owner_id into current_owner from public.aims where id = target_aim_id for update;
  if not found then raise exception 'Aim no encontrado: puede que ya lo hayan robado.'; end if;
  if current_owner = auth.uid() then raise exception 'Ese aim ya es tuyo.'; end if;
  update public.aims set owner_id = auth.uid() where id = target_aim_id;
end;
$$;

create or replace function public.collect_coins()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  earned bigint;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero.'; end if;
  -- Versión inicial: cada recogida concede 5 segundos de ingresos por aim.
  select coalesce(sum(income * 5), 0) into earned
    from public.aims where owner_id = auth.uid();
  update public.players set coins = coins + earned where id = auth.uid();
  return earned;
end;
$$;

revoke all on function public.join_game(text) from public;
revoke all on function public.buy_aim(text) from public;
revoke all on function public.steal_aim(uuid) from public;
revoke all on function public.collect_coins() from public;
grant execute on function public.join_game(text) to authenticated;
grant execute on function public.buy_aim(text) to authenticated;
grant execute on function public.steal_aim(uuid) to authenticated;
grant execute on function public.collect_coins() to authenticated;

-- Habilita actualizaciones en tiempo real para las dos tablas.
do $$
begin
  alter publication supabase_realtime add table public.players;
exception when duplicate_object then null;
when others then
  raise notice 'Si las tablas ya están en la publicación Realtime, puedes ignorar esto. Detalle: %', sqlerrm;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.aims;
exception when duplicate_object then null;
when others then
  raise notice 'Si las tablas ya están en la publicación Realtime, puedes ignorar esto. Detalle: %', sqlerrm;
end $$;
