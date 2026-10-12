create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create table public.salon_settings (
  id int primary key default 1 check (id = 1),
  salon_name text not null default 'Zama''s Braids',
  default_open_time time not null default '08:00',
  default_closing_time time not null default '17:00',
  closing_buffer_minutes int not null default 15 check (closing_buffer_minutes between 15 and 30),
  active_chairs int not null default 4,
  prep_minutes int not null default 40,
  come_closer_minutes int not null default 30,
  almost_done_minutes int not null default 30,
  grace_minutes int not null default 15,
  estimate_band_percent int not null default 25,
  estimate_band_min_minutes int not null default 10,
  overrun_buffer_minutes int not null default 10,
  demo_mode boolean not null default true,
  pin text not null default '!disabled'
);
insert into public.salon_settings default values;

create table public.salon_state (
  id int primary key default 1 check (id = 1),
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  last_event_type text,
  last_event_at timestamptz
);
insert into public.salon_state default values;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  braid_minutes int not null check (braid_minutes > 0),
  price_rands int not null check (price_rands >= 0),
  is_special boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true
);
insert into public.services (name, braid_minutes, price_rands, is_special, sort_order) values
 ('Cornrows (straight back)', 60, 200, false, 1),
 ('Box braids (kids, medium)', 75, 350, false, 2),
 ('Knotless braids (kids, medium)', 90, 450, false, 3),
 ('Two-strand twists', 60, 250, false, 4),
 ('Stitch / Fulani cornrows', 90, 400, false, 5),
 ('Special order (thin or long braids)', 150, 600, true, 6);

create table public.salon_days (
  id uuid primary key default gen_random_uuid(),
  label_date date not null,
  opens_at timestamptz not null unique,
  closes_at timestamptz not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table public.chairs (
  id uuid primary key default gen_random_uuid(),
  num int not null unique,
  label text not null,
  braider_name text not null,
  active boolean not null default false,
  current_booking_id uuid,
  started_at timestamptz,
  planned_minutes int,
  delay_minutes int not null default 0
);
insert into public.chairs (num, label, braider_name, active)
select i, 'Chair ' || i, (array['Palesa','Nomsa','Refilwe','Dineo','Busi','Lindiwe','Mpho','Karabo','Sibongile','Tebogo'])[i], i <= 4
from generate_series(1,10) i;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  salon_day_id uuid not null references public.salon_days(id) on delete cascade,
  code text not null unique,
  parent_name text not null,
  phone text,
  child_name text not null,
  child_age int not null check (child_age between 3 and 14),
  service_id uuid not null references public.services(id),
  needs_wash boolean not null default false,
  mani_pedi boolean not null default true,
  waiting_pref text check (waiting_pref in ('show','game','snack')),
  note text check (note is null or length(note) <= 120),
  status text not null default 'booked' check (status in ('booked','called','in_chair','ready','collected','no_show','cancelled','moved_other_day')),
  queue_order numeric not null,
  checked_in boolean not null default false,
  finish_today_confirmed boolean not null default false,
  moved_note text,
  booked_at timestamptz not null default now(),
  called_at timestamptz,
  estimated_start timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  collected_at timestamptz,
  chair_id uuid references public.chairs(id),
  source text not null check (source in ('online','phone','whatsapp','walk_in')),
  booked_by text not null check (booked_by in ('parent','salon'))
);
create index on public.bookings (salon_day_id, status, queue_order);
alter table public.chairs add constraint chairs_current_booking_fk foreign key (current_booking_id) references public.bookings(id) on delete set null;

create table public.salon_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  salon_day_id uuid references public.salon_days(id) on delete cascade,
  type text not null check (type in ('booked','refused_full','refused_closed','called','arrived','started','delayed','finished','collected','no_show','cancelled','moved_other_day','finish_today','reordered','undo','closing_changed','day_opened','fast_forward','demo_late_day')),
  actor text not null check (actor in ('parent','salon','system','demo')),
  booking_id uuid references public.bookings(id) on delete set null,
  chair_id uuid references public.chairs(id),
  minutes int,
  details jsonb not null default '{}'::jsonb,
  is_tap boolean not null default false
);
create index on public.salon_events (salon_day_id, is_tap);

-- Grants: lock everything, open only safe reads
revoke all on public.salon_settings, public.salon_state, public.services, public.salon_days, public.chairs, public.bookings, public.salon_events from anon, authenticated;
grant all on public.salon_settings, public.salon_state, public.services, public.salon_days, public.chairs, public.bookings, public.salon_events to service_role;
grant select on public.services, public.salon_state to anon, authenticated;

alter table public.salon_settings enable row level security;
alter table public.salon_state enable row level security;
alter table public.services enable row level security;
alter table public.salon_days enable row level security;
alter table public.chairs enable row level security;
alter table public.bookings enable row level security;
alter table public.salon_events enable row level security;

create policy "Anyone can read services" on public.services for select to anon, authenticated using (true);
create policy "Anyone can read salon state" on public.salon_state for select to anon, authenticated using (true);

create view public.salon_settings_public as
  select salon_name, default_open_time, default_closing_time, closing_buffer_minutes, active_chairs,
         prep_minutes, come_closer_minutes, almost_done_minutes, grace_minutes, estimate_band_percent,
         estimate_band_min_minutes, overrun_buffer_minutes, demo_mode
  from public.salon_settings;
revoke all on public.salon_settings_public from anon, authenticated;
grant select on public.salon_settings_public to anon, authenticated;

alter publication supabase_realtime add table public.salon_state;
