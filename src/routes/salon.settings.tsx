import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";
import { CrownedHeader } from "@/components/crowned-header";
import { PinGate } from "@/components/salon/pin-gate";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import { formatClock, getServices } from "@/lib/api";
import {
  act, closingTimestamp, formatDay, getExtras, getFullSettings, getSalonList, resetDemo, updateChair, updateService, updateSettings,
} from "@/lib/salon";

export const Route = createFileRoute("/salon/settings")({
  head: () => ({ meta: [
    { title: "Salon settings — Crowned" },
    { name: "description", content: "Opening times, chairs, style times and alerts for Zama's Braids." },
    { property: "og:title", content: "Salon settings — Crowned" },
    { property: "og:description", content: "Opening times, chairs, style times and alerts for Zama's Braids." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <PinGate>{(pin) => <SettingsPage pin={pin} />}</PinGate>,
});

function SettingsPage({ pin }: { pin: string }) {
  const fetcher = useCallback(async () => {
    const [settings, list, extras, services] = await Promise.all([getFullSettings(), getSalonList(pin), getExtras(pin), getServices()]);
    return { settings, list, extras, services };
  }, [pin]);
  const { data, refresh } = useLive(fetcher);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const afterChange = async (res: { ok?: boolean; message?: string }, beforeRisk: number) => {
    if (!res.ok) { toast.error(res.message ?? "That change wasn't saved."); await refresh(); return; }
    const list = await getSalonList(pin);
    await refresh();
    const risk = list.counts.at_risk;
    if (risk > beforeRisk) toast.warning(`This puts ${risk} ${risk === 1 ? "booking" : "bookings"} at risk of finishing after closing. They'll appear on your floor.`);
    else toast.success("Saved. The plan is updated.");
  };
  if (!data) return <main className="min-h-screen bg-background"><CrownedHeader /><p className="px-5 text-stone">Loading settings…</p></main>;
  const { settings: s, list, extras, services } = data;
  const risk = list.counts.at_risk;
  const save = async (patch: Record<string, Json>) => {
    try { await afterChange(await updateSettings(pin, patch), risk); } catch (e) { toast.error(e instanceof Error ? e.message : "Not saved."); }
  };
  const activeCount = extras.all_chairs.filter((c) => c.active).length;
  const setActive = async (n: number) => {
    try {
      for (const c of extras.all_chairs) {
        const want = c.num <= n;
        if (want !== c.active) { const r = await updateChair(pin, c.id, c.braider_name, want); if (!r.ok) { toast.error(r.message ?? "Not saved."); break; } }
      }
      await afterChange(await updateSettings(pin, { active_chairs: n }), risk);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Not saved."); }
  };
  const day = list.salon_day;

  return (
    <main className="min-h-screen bg-background pb-16">
      <CrownedHeader />
      <div className="mx-auto max-w-3xl space-y-5 px-4 sm:px-8">
        <Link to="/salon" className="inline-flex min-h-12 items-center gap-2 font-semibold"><ArrowLeft className="size-5" />Back to the floor</Link>
        <h1 className="font-display text-[32px]">Settings</h1>

        <Card title="Today and hours">
          <p className="text-[17px] font-bold tabular-nums">Today: {formatClock(day.opens_at)} to {formatClock(day.closes_at)}, {formatDay(day.opens_at)}</p>
          <Row label="Today's closing" hint="Stay open late or close early, just for today.">
            <input type="time" defaultValue={formatClock(day.closes_at)} key={day.closes_at} className="quiet-field h-12 px-3 text-[16px]"
              onBlur={async (e) => { const v = e.target.value; if (!v || v === formatClock(day.closes_at)) return;
                try { await afterChange(await act(pin, "set_today_closing", { value: closingTimestamp(day.label_date, v, day.opens_at) }), risk); } catch (er) { toast.error(er instanceof Error ? er.message : "Not saved."); } }} />
          </Row>
          <Row label="Default opening" hint="Used to open each new salon day.">
             <input type="time" defaultValue={(s.default_open_time ?? "08:00").slice(0, 5)} className="quiet-field h-12 px-3 text-[16px]"
              onBlur={(e) => e.target.value && e.target.value !== s.default_open_time?.slice(0, 5) && void save({ default_open_time: e.target.value })} />
          </Row>
          <Row label="Default closing">
             <input type="time" defaultValue={(s.default_closing_time ?? "17:00").slice(0, 5)} className="quiet-field h-12 px-3 text-[16px]"
              onBlur={(e) => e.target.value && e.target.value !== s.default_closing_time?.slice(0, 5) && void save({ default_closing_time: e.target.value })} />
          </Row>
          <Stepper label="Closing buffer" hint="New bookings must be expected to finish, at the slow end, this long before closing." value={s.closing_buffer_minutes ?? 15} min={15} max={30} step={5} unit="min" onChange={(v) => void save({ closing_buffer_minutes: v })} />
        </Card>

        <Card title="Chairs today">
          <Stepper label="Active chairs" value={activeCount} min={1} max={10} step={1} onChange={(v) => void setActive(v)} />
          <div className="grid gap-2 sm:grid-cols-2">
             {extras.all_chairs.filter((c) => c.active || showInactive).map((c) => (
               <label key={c.id} className={`grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-center gap-3 ${c.active ? "" : "opacity-50"}`}>
                 <span className="text-[15px] text-stone">{c.label}</span>
                 <input defaultValue={c.braider_name} maxLength={40} className="h-12 min-w-0 w-full rounded-xl border border-input bg-shell px-3 text-[17px]"
                  onBlur={async (e) => { const v = e.target.value.trim(); if (v === c.braider_name) return; const r = await updateChair(pin, c.id, v, c.active); r.ok ? toast.success("Saved.") : toast.error(r.message ?? "Not saved."); void refresh(); }} />
              </label>
            ))}
          </div>
          {extras.all_chairs.some((c) => !c.active) && <Button variant="ghost" className="w-full" onClick={() => setShowInactive((value) => !value)}>Show inactive chairs <ChevronDown className={showInactive ? "rotate-180" : ""} /></Button>}
        </Card>

        <Card title="Style times and prices">
          {services.map((sv) => <ServiceRow key={sv.id} name={sv.name} minutes={sv.braid_minutes} price={sv.price_rands}
            onSave={async (m, p) => { try { await afterChange(await updateService(pin, sv.id, m, p), risk); } catch (e) { toast.error(e instanceof Error ? e.message : "Not saved."); } }} />)}
        </Card>

        <Card title="Timing and alerts">
          <Stepper label="Wash and detangle" value={s.prep_minutes ?? 40} min={0} max={120} step={5} unit="min" onChange={(v) => void save({ prep_minutes: v })} />
          <Stepper label="Come-closer alert" value={s.come_closer_minutes ?? 30} min={5} max={90} step={5} unit="min" onChange={(v) => void save({ come_closer_minutes: v })} />
          <Stepper label="Almost-done alert" value={s.almost_done_minutes ?? 30} min={5} max={90} step={5} unit="min" onChange={(v) => void save({ almost_done_minutes: v })} />
          <Stepper label="Grace period" value={s.grace_minutes ?? 15} min={5} max={60} step={5} unit="min" onChange={(v) => void save({ grace_minutes: v })} />
          <Stepper label="Estimate band" hint="Widen it on busy or fidgety days. Never less than 10 min." value={s.estimate_band_percent ?? 25} min={10} max={60} step={5} unit="%" onChange={(v) => void save({ estimate_band_percent: v })} />
          <Stepper label="Running-over buffer" value={s.overrun_buffer_minutes ?? 10} min={0} max={60} step={5} unit="min" onChange={(v) => void save({ overrun_buffer_minutes: v })} />
        </Card>

        <div className="border-t border-border pt-5"><Card title="Demo">
          {!confirmReset ? <Button variant="outline" size="lg" className="w-full" onClick={() => setConfirmReset(true)}>Reset demo Saturday</Button> : (
            <div className="space-y-2">
              <p className="font-semibold">This replaces today's demo bookings with the sample Saturday. Real bookings are never touched.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="lg" onClick={() => setConfirmReset(false)}>Keep as is</Button>
                <Button size="lg" onClick={async () => { setConfirmReset(false); const r = await resetDemo(pin); r.ok ? toast.success("Demo Saturday is ready.") : toast.error(r.message ?? "Couldn't reset."); void refresh(); }}>Reset demo</Button>
              </div>
            </div>
          )}
        </Card></div>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 space-y-4 rounded-2xl bg-shell p-4 sm:p-5"><h2 className="text-[22px] font-bold">{title}</h2>{children}</section>;
}
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="grid min-w-0 gap-2 min-[390px]:grid-cols-[minmax(0,1fr)_auto] min-[390px]:items-center min-[390px]:gap-3"><div className="min-w-0"><p className="font-semibold">{label}</p>{hint && <p className="text-[13px] text-stone">{hint}</p>}</div><div className="min-w-0 justify-self-end">{children}</div></div>;
}
function Stepper({ label, hint, value, min, max, step, unit, onChange }: { label: string; hint?: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <Row label={label} {...(hint ? { hint } : {})}>
      <div className="grid shrink-0 grid-cols-[48px_64px_48px] items-center gap-2">
        <Button variant="outline" size="icon" className="size-12" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>−</Button>
        <span className="w-16 text-center text-[17px] font-bold tabular-nums">{value}{unit ? ` ${unit}` : ""}</span>
        <Button variant="outline" size="icon" className="size-12" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</Button>
      </div>
    </Row>
  );
}
function ServiceRow({ name, minutes, price, onSave }: { name: string; minutes: number; price: number; onSave: (m: number, p: number) => void }) {
  const [p, setP] = useState(String(price));
  useEffect(() => setP(String(price)), [price]);
  return (
    <div className="space-y-2 border-b border-border pb-3 last:border-0">
      <p className="font-semibold">{name}</p>
       <div className="grid min-w-0 gap-3 min-[390px]:grid-cols-[auto_minmax(0,1fr)] min-[390px]:items-center">
         <div className="grid grid-cols-[48px_80px_48px] items-center gap-2">
          <Button variant="outline" size="icon" className="size-12" onClick={() => onSave(Math.max(10, minutes - 5), price)}>−</Button>
          <span className="w-20 text-center font-bold tabular-nums">{minutes} min</span>
          <Button variant="outline" size="icon" className="size-12" onClick={() => onSave(Math.min(480, minutes + 5), price)}>+</Button>
        </div>
         <label className="flex min-w-0 items-center justify-self-end gap-1 font-bold">R<input inputMode="numeric" value={p} onChange={(e) => setP(e.target.value.replace(/\D/g, ""))}
           onBlur={() => { const n = Number(p); if (p && n !== price) onSave(minutes, n); }} className="h-12 min-w-0 w-24 max-w-full rounded-xl border border-input bg-background px-3 tabular-nums" /></label>
      </div>
    </div>
  );
}
