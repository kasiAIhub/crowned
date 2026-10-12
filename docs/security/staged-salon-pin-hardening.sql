-- STAGED — NOT APPLIED. Revised after owner review (2026-09-27).
-- Apply only together with the reviewed setup endpoint (/salon/setup server check).
--
-- Design
-- * No caller-supplied headers or JWT claims are trusted for identity or privilege.
-- * PIN guesses are only possible through public.salon_sign_in (counted, never rolled back).
-- * Every real salon read/action keeps its existing, unmodified body: each already calls
--   private.require_pin(pin). We redefine only that helper so the "pin" argument must be a
--   server-issued session token (32 random bytes, stored hashed, 12 h expiry). Raising inside
--   the helper is fine because a token is unguessable, so no attempt counting is needed there.
--   No live function is text-rewritten; signatures and return types are untouched.
-- * Lockout: new/unknown devices share one global budget (10 wrong PINs / 15 min -> 15 min lock).
--   Devices that have signed in before hold a server-issued device token (hashed in DB); they get
--   their own budget (5 / 15 min) and are NOT blocked by the global lock, so an attacker cannot
--   lock Tsholo out of her own phone. Guess rate for an attacker: <= 960/day against 10^6 PINs
--   (~520 days expected). DoS tradeoff: an attacker can delay sign-in on a brand-new device by
--   up to 15 min at a time; trusted devices are unaffected.
-- * Setup: one-time, 48 h window, 5 failed code attempts max, executable ONLY by service_role via
--   Postgres GRANTs (not claim checks). The server compares the setup code (a secret Tsholo types
--   into the Lovable secret form) in constant time, then calls admin_complete_pin_setup, which in one
--   transaction stores the bcrypt hash, blanks the legacy plaintext PIN and revokes all sessions.
-- * Before setup, the legacy PIN still signs in (so nobody is locked out) but also only via
--   salon_sign_in with the same lockout.

create extension if not exists pgcrypto with schema extensions;

create table private.salon_secret (id int primary key default 1 check (id = 1), pin_hash text, set_at timestamptz);
insert into private.salon_secret (id) values (1);
create table private.salon_sessions (token_hash text primary key, expires_at timestamptz not null);
create table private.salon_devices (device_hash text primary key, fails int not null default 0,
  window_start timestamptz not null default now(), locked_until timestamptz);
create table private.pin_global (id int primary key default 1 check (id = 1), fails int not null default 0,
  window_start timestamptz not null default now(), locked_until timestamptz);
insert into private.pin_global (id) values (1);
create table private.pin_setup (id int primary key default 1 check (id = 1),
  expires_at timestamptz not null default now() + interval '48 hours', fails int not null default 0, used_at timestamptz);
insert into private.pin_setup (id) values (1);
revoke all on private.salon_secret, private.salon_sessions, private.salon_devices, private.pin_global, private.pin_setup
  from public, anon, authenticated;

create function private.pin_matches(p text) returns boolean language sql stable security definer
set search_path = public, private, extensions as $$
  select case when x.pin_hash is not null then extensions.crypt(p, x.pin_hash) = x.pin_hash
              else exists (select 1 from public.salon_settings s where s.id = 1 and s.pin = p and left(s.pin, 1) <> '!') end
  from private.salon_secret x where x.id = 1
$$;
revoke all on function private.pin_matches(text) from public, anon, authenticated;

-- Returns {ok, token, device} or {ok:false, message}. Never raises, so failed tries are committed.
create function public.salon_sign_in(pin text, device text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, private, extensions as $$
declare n timestamptz := now(); dh text; d private.salon_devices; g private.pin_global; tok text; dev text;
begin
  if device is not null and length(device) between 40 and 100 then
    dh := encode(extensions.digest(device, 'sha256'), 'hex');
    select * into d from private.salon_devices where device_hash = dh for update;
  end if;
  select * into g from private.pin_global where id = 1 for update;
  if d.device_hash is not null then
    if d.locked_until > n then return jsonb_build_object('ok', false, 'message', 'Too many tries. Please wait 15 minutes.'); end if;
  elsif g.locked_until > n then
    return jsonb_build_object('ok', false, 'message', 'Too many tries. Please wait 15 minutes.');
  end if;
  if pin is null or pin !~ '^[0-9]{4,6}$' or not coalesce(private.pin_matches(pin), false) then
    if d.device_hash is not null then
      update private.salon_devices set
        fails = case when window_start < n - interval '15 minutes' then 1 else fails + 1 end,
        window_start = case when window_start < n - interval '15 minutes' then n else window_start end
      where device_hash = dh;
      update private.salon_devices set locked_until = n + interval '15 minutes', fails = 0 where device_hash = dh and fails >= 5;
    else
      update private.pin_global set
        fails = case when window_start < n - interval '15 minutes' then 1 else fails + 1 end,
        window_start = case when window_start < n - interval '15 minutes' then n else window_start end
      where id = 1;
      update private.pin_global set locked_until = n + interval '15 minutes', fails = 0 where id = 1 and fails >= 10;
    end if;
    return jsonb_build_object('ok', false, 'message', 'That PIN didn''t match. Please try again.');
  end if;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.salon_sessions values (encode(extensions.digest(tok, 'sha256'), 'hex'), n + interval '12 hours');
  delete from private.salon_sessions where expires_at < n;
  if d.device_hash is not null then
    update private.salon_devices set fails = 0, locked_until = null where device_hash = dh; dev := device;
  else
    dev := encode(extensions.gen_random_bytes(32), 'hex');
    insert into private.salon_devices (device_hash) values (encode(extensions.digest(dev, 'sha256'), 'hex'));
  end if;
  return jsonb_build_object('ok', true, 'token', tok, 'device', dev);
end $$;
revoke all on function public.salon_sign_in(text, text) from public;
grant execute on function public.salon_sign_in(text, text) to anon, authenticated;

-- Existing salon_login(pin) boolean: kept (same signature) but routed through the counted path.
create or replace function public.salon_login(pin text) returns boolean
language sql volatile security definer set search_path = public, private as $$
  select (public.salon_sign_in(salon_login.pin, null)->>'ok')::boolean
$$;

-- The single gate used by salon_list, salon_extras, salon_action, update_chair, update_service,
-- update_settings, reset_demo (their bodies are unchanged). Parameter name must stay "p".
create or replace function private.require_pin(p text) returns void
language plpgsql stable security definer set search_path = public, private, extensions as $$
begin
  if p is null or length(p) <> 64 or not exists (select 1 from private.salon_sessions
     where token_hash = encode(extensions.digest(p, 'sha256'), 'hex') and expires_at > now()) then
    raise exception 'Wrong PIN.';
  end if;
end $$;

create function public.admin_pin_setup_open() returns boolean language sql stable security definer
set search_path = public, private as $$
  select s.used_at is null and x.pin_hash is null and s.fails < 5 and now() < s.expires_at
  from private.pin_setup s, private.salon_secret x where s.id = 1 and x.id = 1
$$;
create function public.admin_record_pin_setup_failure() returns void language sql volatile security definer
set search_path = public, private as $$ update private.pin_setup set fails = fails + 1 where id = 1 $$;
create function public.admin_complete_pin_setup(new_pin text) returns jsonb
language plpgsql volatile security definer set search_path = public, private, extensions as $$
declare s private.pin_setup; h text;
begin
  select * into s from private.pin_setup where id = 1 for update;
  select pin_hash into h from private.salon_secret where id = 1 for update;
  if s.used_at is not null or h is not null or s.fails >= 5 or now() >= s.expires_at then
    return jsonb_build_object('ok', false, 'message', 'This setup link is closed.'); end if;
  if new_pin is null or new_pin !~ '^[0-9]{6}$' then return jsonb_build_object('ok', false, 'message', 'The PIN must be 6 digits.'); end if;
  update private.salon_secret set pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf', 10)), set_at = now() where id = 1;
  update private.pin_setup set used_at = now() where id = 1;
  update public.salon_settings set pin = '!disabled' where id = 1;   -- legacy PIN dies in the same transaction
  delete from private.salon_sessions;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_pin_setup_open(), public.admin_record_pin_setup_failure(),
  public.admin_complete_pin_setup(text) from public, anon, authenticated;
grant execute on function public.admin_pin_setup_open(), public.admin_record_pin_setup_failure(),
  public.admin_complete_pin_setup(text) to service_role;

-- Rollback (restores current behaviour; legacy PIN only works if setup has not run):
--   drop function public.admin_complete_pin_setup(text), public.admin_record_pin_setup_failure(),
--     public.admin_pin_setup_open(), public.salon_sign_in(text, text), private.pin_matches(text);
--   restore private.require_pin / public.salon_login from migration history; drop the private tables above.
--
-- Non-mutating tests after apply (anon key, no bookings touched):
--   1. salon_list / salon_extras / salon_action with no token, a random 64-hex string, and the legacy
--      PIN -> "Wrong PIN." each (the PIN itself is no longer a credential for reads).
--   2. admin_* functions with the anon key -> permission denied (GRANT-level, not claim-level).
--   3. has_function_privilege('anon'|'authenticated', 'public.admin_complete_pin_setup(text)', 'execute') = false.
--   4. Lockout checked in a rolled-back transaction: 10 wrong sign-ins -> locked; device path unaffected.
--   5. After Tsholo's setup: salon_secret.pin_hash set, pin_setup.used_at set, salon_settings.pin = '!disabled',
--      legacy PIN sign-in refused; Tsholo confirms her new PIN opens /salon.
