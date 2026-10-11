-- Online chess between friends / collaborators (additive).
--
-- Authority: moves are validated by the `chess-move` Edge Function with a
-- real rules engine and applied through apply_chess_move(), which only the
-- service role may call. Clients can READ their own games (RLS) and use the
-- RPCs below for challenge / accept / decline / cancel / resign / draw offers
-- — none of which require chess rules. Realtime is transport only.

create table public.chess_games (
  id uuid primary key default gen_random_uuid(),
  white_id uuid not null references public.profiles (id) on delete cascade,
  black_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'active', 'finished', 'declined', 'cancelled')),
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' check (char_length(fen) <= 100),
  ply integer not null default 0 check (ply >= 0),
  result text check (result is null or result in ('1-0', '0-1', '1/2-1/2')),
  termination text check (termination is null or termination in
    ('checkmate', 'stalemate', 'insufficient_material', 'threefold_repetition', 'fifty_move', 'resignation', 'draw_agreement')),
  draw_offered_by uuid references public.profiles (id) on delete set null,
  -- Canonical place where the game was started (World Chess Hall of Fame).
  venue_ref text check (venue_ref is null or venue_ref ~ '^osm:(node|way|relation)/[0-9]{1,15}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (white_id <> black_id),
  check ((status = 'finished') = (result is not null))
);
create index chess_games_white_idx on public.chess_games (white_id, updated_at desc);
create index chess_games_black_idx on public.chess_games (black_id, updated_at desc);
create trigger chess_games_touch before update on public.chess_games for each row execute function public.touch_updated_at();

create table public.chess_moves (
  game_id uuid not null references public.chess_games (id) on delete cascade,
  ply integer not null check (ply >= 1),
  san text not null check (char_length(san) between 2 and 10),
  uci text not null check (uci ~ '^[a-h][1-8][a-h][1-8][qrbn]?$'),
  fen_after text not null check (char_length(fen_after) <= 100),
  played_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, ply)
);

alter table public.chess_games enable row level security;
alter table public.chess_moves enable row level security;

create policy chess_games_players on public.chess_games for select to authenticated
  using ((select auth.uid()) in (white_id, black_id));
create policy chess_moves_players on public.chess_moves for select to authenticated
  using (exists (select 1 from public.chess_games g where g.id = game_id and (select auth.uid()) in (g.white_id, g.black_id)));

revoke all on public.chess_games, public.chess_moves from anon;
revoke insert, update, delete on public.chess_games, public.chess_moves from authenticated;
grant select on public.chess_games, public.chess_moves to authenticated;

-- Notifications for chess (extends 0015).
alter table public.notifications add column if not exists chess_game_id uuid references public.chess_games (id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'shared_pin_added', 'meetup_created', 'meetup_rescheduled', 'meetup_cancelled', 'meetup_joined',
  'chess_challenge', 'chess_accepted', 'chess_your_turn', 'chess_finished'));

create or replace function public.notify_chess(p_user uuid, p_actor uuid, p_kind text, p_game uuid, p_title text, p_key text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, actor_id, chess_game_id, title, dedupe_key)
  values (p_user, p_kind, p_actor, p_game, left(p_title, 300), p_key)
  on conflict (user_id, dedupe_key) do nothing;
$$;
revoke all on function public.notify_chess(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;

-- Who may be challenged: accepted friends, or co-members of a collaboration map.
create or replace function public.can_challenge(p_me uuid, p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.requester_id = p_me and f.addressee_id = p_other) or (f.requester_id = p_other and f.addressee_id = p_me))
  ) or exists (
    select 1 from public.collab_members a join public.collab_members b on a.map_id = b.map_id
     where a.user_id = p_me and b.user_id = p_other
  );
$$;
revoke all on function public.can_challenge(uuid, uuid) from public, anon, authenticated;

-- People you can challenge (friends + collaborators), for the picker.
create or replace function public.chess_opponents()
returns table (id uuid, username text, display_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name from public.profiles p
   where p.id <> auth.uid() and public.can_challenge(auth.uid(), p.id)
   order by lower(coalesce(nullif(p.display_name, ''), p.username));
$$;

create or replace function public.create_chess_challenge(p_opponent uuid, p_color text default 'random', p_venue_ref text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.require_uid();
  v_white boolean;
  v_id uuid;
  v_name text;
begin
  if p_opponent is null or p_opponent = v_me or not public.can_challenge(v_me, p_opponent) then
    raise exception 'You can only challenge friends or people you share a collaboration map with' using errcode = '42501';
  end if;
  if p_color not in ('white', 'black', 'random') then raise exception 'Invalid colour' using errcode = '22023'; end if;
  if (select count(*) from public.chess_games where created_by = v_me and status = 'invited') >= 10 then
    raise exception 'You have too many open challenges' using errcode = '22023';
  end if;
  v_white := case p_color when 'white' then true when 'black' then false
             else (get_byte(uuid_send(gen_random_uuid()), 0) % 2) = 0 end; -- CSPRNG (pg_strong_random)
  insert into public.chess_games (white_id, black_id, created_by, venue_ref)
  values (case when v_white then v_me else p_opponent end, case when v_white then p_opponent else v_me end, v_me, p_venue_ref)
  returning id into v_id;
  select coalesce(nullif(display_name, ''), username) into v_name from public.profiles where id = v_me;
  perform public.notify_chess(p_opponent, v_me, 'chess_challenge', v_id, v_name || ' challenged you to chess', 'chess-challenge:' || v_id::text);
  return v_id;
end; $$;

create or replace function public.respond_chess_challenge(p_game_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.require_uid(); v_g public.chess_games;
begin
  select * into v_g from public.chess_games where id = p_game_id for update;
  if not found or v_me not in (v_g.white_id, v_g.black_id) then raise exception 'Game not found' using errcode = 'P0002'; end if;
  if v_g.created_by = v_me then raise exception 'Only the challenged player can respond' using errcode = '42501'; end if;
  if v_g.status <> 'invited' then raise exception 'This challenge is no longer open' using errcode = '22023'; end if;
  update public.chess_games set status = case when p_accept then 'active' else 'declined' end where id = p_game_id;
  if p_accept then
    perform public.notify_chess(v_g.created_by, v_me, 'chess_accepted', p_game_id, 'Your chess challenge was accepted', 'chess-accepted:' || p_game_id::text);
  end if;
end; $$;

create or replace function public.cancel_chess_challenge(p_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.require_uid();
begin
  update public.chess_games set status = 'cancelled' where id = p_game_id and created_by = v_me and status = 'invited';
  if not found then raise exception 'Challenge not found or no longer open' using errcode = '22023'; end if;
end; $$;

create or replace function public.resign_chess_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.require_uid(); v_g public.chess_games; v_other uuid;
begin
  select * into v_g from public.chess_games where id = p_game_id for update;
  if not found or v_me not in (v_g.white_id, v_g.black_id) then raise exception 'Game not found' using errcode = 'P0002'; end if;
  if v_g.status <> 'active' then raise exception 'This game isn''t in progress' using errcode = '22023'; end if;
  update public.chess_games set status = 'finished', termination = 'resignation', draw_offered_by = null,
    result = case when v_me = v_g.white_id then '0-1' else '1-0' end where id = p_game_id;
  v_other := case when v_me = v_g.white_id then v_g.black_id else v_g.white_id end;
  perform public.notify_chess(v_other, v_me, 'chess_finished', p_game_id, 'Your opponent resigned', 'chess-finished:' || p_game_id::text);
end; $$;

-- Offer a draw, or accept the opponent standing offer.
create or replace function public.offer_or_accept_draw(p_game_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.require_uid(); v_g public.chess_games; v_other uuid;
begin
  select * into v_g from public.chess_games where id = p_game_id for update;
  if not found or v_me not in (v_g.white_id, v_g.black_id) then raise exception 'Game not found' using errcode = 'P0002'; end if;
  if v_g.status <> 'active' then raise exception 'This game isn''t in progress' using errcode = '22023'; end if;
  v_other := case when v_me = v_g.white_id then v_g.black_id else v_g.white_id end;
  if v_g.draw_offered_by = v_other then
    update public.chess_games set status = 'finished', result = '1/2-1/2', termination = 'draw_agreement', draw_offered_by = null where id = p_game_id;
    perform public.notify_chess(v_other, v_me, 'chess_finished', p_game_id, 'Your draw offer was accepted', 'chess-finished:' || p_game_id::text);
    return 'drawn';
  end if;
  update public.chess_games set draw_offered_by = v_me where id = p_game_id;
  return 'offered';
end; $$;

create or replace function public.decline_draw(p_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.require_uid();
begin
  update public.chess_games set draw_offered_by = null
   where id = p_game_id and status = 'active' and v_me in (white_id, black_id) and draw_offered_by is not null and draw_offered_by <> v_me;
end; $$;

-- Applied ONLY by the chess-move Edge Function after server-side rule validation.
-- Optimistic concurrency: p_expected_ply must equal the stored ply.
create or replace function public.apply_chess_move(
  p_game_id uuid, p_player uuid, p_expected_ply integer, p_san text, p_uci text, p_fen_after text,
  p_result text default null, p_termination text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_g public.chess_games; v_other uuid; v_white_turn boolean; v_to_move uuid;
begin
  select * into v_g from public.chess_games where id = p_game_id for update;
  if not found then raise exception 'Game not found' using errcode = 'P0002'; end if;
  if v_g.status <> 'active' then raise exception 'This game isn''t in progress' using errcode = '22023'; end if;
  if v_g.ply <> p_expected_ply then raise exception 'The game has moved on — refresh' using errcode = '40001'; end if;
  v_white_turn := split_part(v_g.fen, ' ', 2) = 'w';
  -- (Computed first: a CASE ... THEN inside an IF condition confuses PL/pgSQL.)
  v_to_move := case when v_white_turn then v_g.white_id else v_g.black_id end;
  if p_player <> v_to_move then
    raise exception 'It isn''t your turn' using errcode = '42501';
  end if;
  insert into public.chess_moves (game_id, ply, san, uci, fen_after, played_by)
  values (p_game_id, v_g.ply + 1, p_san, p_uci, p_fen_after, p_player);
  update public.chess_games set ply = v_g.ply + 1, fen = p_fen_after, draw_offered_by = null,
    status = case when p_result is null then 'active' else 'finished' end, result = p_result, termination = p_termination
   where id = p_game_id;
  v_other := case when p_player = v_g.white_id then v_g.black_id else v_g.white_id end;
  if p_result is null then
    perform public.notify_chess(v_other, p_player, 'chess_your_turn', p_game_id, 'It''s your move', 'chess-turn:' || p_game_id::text || ':' || (v_g.ply + 1));
  else
    perform public.notify_chess(v_other, p_player, 'chess_finished', p_game_id, 'Your chess game ended', 'chess-finished:' || p_game_id::text);
  end if;
  return v_g.ply + 1;
end; $$;

-- Draw claims (threefold / fifty-move) are also verified by the Edge Function.
create or replace function public.finish_chess_game(p_game_id uuid, p_player uuid, p_expected_ply integer, p_result text, p_termination text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_g public.chess_games;
begin
  select * into v_g from public.chess_games where id = p_game_id for update;
  if not found or p_player not in (v_g.white_id, v_g.black_id) then raise exception 'Game not found' using errcode = 'P0002'; end if;
  if v_g.status <> 'active' or v_g.ply <> p_expected_ply then raise exception 'The game has moved on — refresh' using errcode = '40001'; end if;
  update public.chess_games set status = 'finished', result = p_result, termination = p_termination, draw_offered_by = null where id = p_game_id;
end; $$;

revoke all on function public.chess_opponents() from public, anon;
revoke all on function public.create_chess_challenge(uuid, text, text) from public, anon;
revoke all on function public.respond_chess_challenge(uuid, boolean) from public, anon;
revoke all on function public.cancel_chess_challenge(uuid) from public, anon;
revoke all on function public.resign_chess_game(uuid) from public, anon;
revoke all on function public.offer_or_accept_draw(uuid) from public, anon;
revoke all on function public.decline_draw(uuid) from public, anon;
revoke all on function public.apply_chess_move(uuid, uuid, integer, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.finish_chess_game(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.chess_opponents() to authenticated;
grant execute on function public.create_chess_challenge(uuid, text, text) to authenticated;
grant execute on function public.respond_chess_challenge(uuid, boolean) to authenticated;
grant execute on function public.cancel_chess_challenge(uuid) to authenticated;
grant execute on function public.resign_chess_game(uuid) to authenticated;
grant execute on function public.offer_or_accept_draw(uuid) to authenticated;
grant execute on function public.decline_draw(uuid) to authenticated;
grant execute on function public.apply_chess_move(uuid, uuid, integer, text, text, text, text, text) to service_role;
grant execute on function public.finish_chess_game(uuid, uuid, integer, text, text) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chess_games, public.chess_moves;
  end if;
end $$;
