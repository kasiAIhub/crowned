import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { isPractice, rpc, servicesTable, settingsView, stateTable } from "@/lib/practice";
import { formatClock, formatDuration, minutesUntil, ordinal } from "@/lib/api";

const PIN_KEY = "crowned_salon_pin";
export const getPin = () => (typeof window === "undefined" ? null : sessionStorage.getItem(PIN_KEY));
export const setPin = (pin: string) => sessionStorage.setItem(PIN_KEY, pin);
export const clearPin = () => sessionStorage.removeItem(PIN_KEY);

export type SalonBooking = {
  id: string; code: string; parent_name: string; phone: string | null; child_name: string; child_age: number;
  service_id: string; style: string; minutes: number; needs_wash: boolean; mani_pedi: boolean;
  waiting_pref: string | null; note: string | null; status: string; checked_in: boolean;
  finish_today_confirmed: boolean; source: string; booked_by: string; queue_order: number; booked_at: string;
  called_at: string | null; grace_ends_at: string | null; estimated_start: string | null; started_at: string | null;
  finished_at: string | null; chair_id: string | null; position: number | null; expected_start: string | null;
  start_low: string | null; start_high: string | null; expected_finish: string | null; finish_high: string | null;
  running_over: boolean; at_risk: boolean; after_closing: boolean;
};
export type SalonChair = {
  id: string; label: string; braider_name: string; current_booking_id: string | null; current_code: string | null;
  current_child: string | null; started_at: string | null; planned_minutes: number | null; delay_minutes: number;
};
export type AfterClosingRow = {
  id: string; code: string; parent_name: string; phone: string | null; child_name: string; status: string;
  label_date: string; chair_id: string | null;
};
export type SalonList = {
  salon_day: { id: string; label_date: string; opens_at: string; closes_at: string; is_open: boolean; is_demo: boolean };
  bookings: SalonBooking[]; chairs: SalonChair[]; after_closing: AfterClosingRow[];
  counts: { girls_done: number; no_shows: number; taps_today: number; at_risk: number; refusals_today: number };
  version: number;
};
export type SalonExtras = {
  all_chairs: { id: string; num: number; label: string; braider_name: string; active: boolean; busy: boolean }[];
  avg_wait_minutes: number | null; accuracy_percent: number | null; accuracy_sample: number;
};
export type Result = { ok?: boolean; message?: string; code?: string; refused?: boolean; undid?: string };

function fail(message: string): never {
  if (message === "Wrong PIN.") clearPin();
  throw new Error(message || "Crowned couldn't reach the salon right now.");
}
// After PIN hardening, protected RPCs return { auth: false } instead of data on a wrong or locked-out PIN.
function guard<T>(data: unknown): T {
  const d = data as { auth?: boolean; message?: string } | null;
  if (d && d.auth === false) { clearPin(); fail(d.message ?? "Wrong PIN."); }
  return data as T;
}

const DEVICE_KEY = "crowned_salon_device";
/** Counted sign-in: returns a short-lived session token (never the PIN) to pass to salon RPCs. */
export async function salonLogin(pin: string): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  const legacy = async () => {
    const { data, error } = await rpc("salon_login", { pin });
    if (error) fail(error.message);
    return data === true ? { ok: true as const, token: pin } : { ok: false as const, message: "That PIN didn't match. Please try again." };
  };
  if (isPractice()) return legacy();
  const stored = localStorage.getItem(DEVICE_KEY);
  const device = stored && /^[0-9a-f]{64}$/.test(stored) ? stored : null;
  const { data, error } = await rpc("salon_sign_in", { pin, device });
  if (error) {
    // Before the hardening migration is applied, the counted sign-in doesn't exist yet.
    if ((error as { code?: string }).code === "PGRST202") return legacy();
    fail(error.message);
  }
  const r = data as { ok: boolean; token?: string; device?: string; message?: string };
  if (!r?.ok || !r.token) return { ok: false, message: r?.message ?? "That PIN didn't match. Please try again." };
  if (r.device) localStorage.setItem(DEVICE_KEY, r.device);
  return { ok: true, token: r.token };
}
export async function getSalonList(pin: string) {
  const { data, error } = await rpc("salon_list", { pin });
  if (error) fail(error.message);
  return guard<SalonList>(data);
}
export async function getExtras(pin: string) {
  const { data, error } = await rpc("salon_extras", { pin });
  if (error) fail(error.message);
  return guard<SalonExtras>(data);
}
export async function act(pin: string, action: string, opts: { booking?: string; chair?: string; value?: Json | undefined } = {}) {
  const args: { pin: string; action: string; booking_id?: string; chair_id?: string; value?: Json } = { pin, action };
  if (opts.booking) args.booking_id = opts.booking;
  if (opts.chair) args.chair_id = opts.chair;
  if (opts.value !== undefined) args.value = opts.value;
  const { data, error } = await rpc("salon_action", args);
  if (error) fail(error.message);
  return guard<Result>(data);
}
export async function updateSettings(pin: string, settings: Record<string, Json>) {
  const { data, error } = await rpc("update_settings", { pin, settings });
  if (error) fail(error.message);
  return guard<Result>(data);
}
export async function updateService(pin: string, id: string, braid_minutes: number, price_rands: number) {
  const { data, error } = await rpc("update_service", { pin, id, braid_minutes, price_rands });
  if (error) fail(error.message);
  return guard<Result>(data);
}
export async function updateChair(pin: string, id: string, braider_name: string, active: boolean) {
  const { data, error } = await rpc("update_chair", { pin, id, braider_name, active });
  if (error) fail(error.message);
  return guard<Result>(data);
}
export async function resetDemo(pin: string) {
  const { data, error } = await rpc("reset_demo", { pin });
  if (error) fail(error.message);
  return guard<Result>(data);
}
export async function getFullSettings() {
  const { data, error } = await supabase.from(settingsView()).select("*").single();
  if (error) fail(error.message);
  return data;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
export const bookingLink = (code: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/b/${code}`;
export const waLink = (phone: string | null, text: string) => {
  const d = (phone ?? "").replace(/\D/g, "");
  const intl = d.startsWith("0") ? `27${d.slice(1)}` : d;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
};

export function riskMessage(parent: string, child: string, closesAt: string, priority: boolean) {
  return `Good day ${firstName(parent)}, it's Zama's Braids. We're running later than planned today, and ${child}'s hair may finish after our ${formatClock(closesAt)} closing. Would you like us to finish today, even if it's a little late, or move her to another day?${priority ? " If another day suits you better, I'd like to offer you a priority place." : ""}`;
}
export function comeCloserMessage(b: SalonBooking, now: number) {
  const mins = b.expected_start ? formatDuration(minutesUntil(b.expected_start, now)) : "about 30 min";
  return `Good day ${firstName(b.parent_name)}, it's Zama's Braids. ${b.child_name}'s chair should be ready in ${mins.replace("about ", "about ")}. Please head over now. Her live booking: ${bookingLink(b.code)}`;
}
export function bookedMessage(parent: string, child: string, position: number, wait: string, code: string) {
  return `Good day ${firstName(parent)}, it's Zama's Braids. ${child} is booked, with a confirmed place in today's line. She's ${ordinal(position)}, and her chair is ${wait} away. We'll tell you when to come. Follow her booking live: ${bookingLink(code)}`;
}

export const SOURCE_LABEL: Record<string, string> = { online: "Online", phone: "Phone", whatsapp: "WhatsApp", walk_in: "Walk-in" };
export const PREF_LABEL: Record<string, string> = { show: "📺 Show", game: "🎲 Game", snack: "🍎 Snack" };

const dateFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short" });
export const formatDay = (ts: string) => dateFmt.format(new Date(ts));

/** Builds a SAST timestamp from the salon day's label date + a picked time; rolls past midnight if it lands before opening. */
export function closingTimestamp(labelDate: string, hhmm: string, opensAt: string) {
  let t = new Date(`${labelDate}T${hhmm}:00+02:00`);
  if (t.getTime() <= new Date(opensAt).getTime()) t = new Date(t.getTime() + 86_400_000);
  return t.toISOString();
}
