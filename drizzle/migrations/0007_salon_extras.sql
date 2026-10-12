CREATE OR REPLACE FUNCTION public.salon_extras(pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare cd record;
begin
  perform private.require_pin(pin);
  select * into cd from private.current_day();
  return jsonb_build_object(
    'all_chairs', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'num', c.num, 'label', c.label,
        'braider_name', c.braider_name, 'active', c.active, 'busy', c.current_booking_id is not null) order by c.num)
      from public.chairs c), '[]'::jsonb),
    'avg_wait_minutes', (select round(avg(extract(epoch from b.started_at - b.booked_at) / 60))
      from public.bookings b where b.salon_day_id = cd.id and b.started_at is not null),
    'accuracy_percent', (select round(100.0 * count(*) filter (where abs(extract(epoch from b.started_at - b.estimated_start)) <= 600) / nullif(count(*), 0))
      from public.bookings b where b.salon_day_id = cd.id and b.started_at is not null and b.estimated_start is not null),
    'accuracy_sample', (select count(*) from public.bookings b where b.salon_day_id = cd.id and b.started_at is not null and b.estimated_start is not null));
end $function$;
REVOKE ALL ON FUNCTION public.salon_extras(text) FROM public;
GRANT EXECUTE ON FUNCTION public.salon_extras(text) TO anon, authenticated;