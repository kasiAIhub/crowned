import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { isPractice, rpc, servicesTable, settingsView, stateTable } from "@/lib/practice";

export type Overview = {
  is_open: boolean;
  opens_at: string;
  closes_at: string;
  next_opening: string | null;
  girls_in_chairs: number;
  bookings_waiting: number;
  next_new_booking: {
    wait_minutes: number;
    start_low: string;
    start_high: string;
  } | null;
  any_style_fits: boolean;
  all_styles_fit: boolean;
  version: number;
};

export type BookingOption = {
  service_id: string;
  fits: boolean;
  people_ahead: number;
  start_low: string;
  start_high: string;
  finish_high: string;
};

export type PlannerFlags = {
  at_risk?: boolean | null;
  after_closing?: boolean | null;
  running_over?: boolean | null;
  checked_in?: boolean | null;
  start_low?: string | null;
  expected_finish?: string | null;
};

function rpcError(message: string) {
  return new Error(message || "Crowned couldn't refresh right now.");
}

export async function getOverview(): Promise<Overview> {
  const { data, error } = await rpc("public_overview");
  if (error) throw rpcError(error.message);
  return data as unknown as Overview;
}

export async function getOptions(needsWash: boolean): Promise<BookingOption[]> {
  const { data, error } = await rpc("booking_options", { needs_wash: needsWash });
  if (error) throw rpcError(error.message);
  return (data ?? []) as BookingOption[];
}

export async function getBooking(code: string): Promise<Record<string, unknown>> {
  const { data, error } = await rpc("get_booking", { code });
  if (error) throw rpcError(error.message);
  return data as Record<string, unknown>;
}

export async function getSalon(pin: string): Promise<Record<string, unknown>> {
  const { data, error } = await rpc("salon_list", { pin });
  if (error) throw rpcError(error.message);
  return data as Record<string, unknown>;
}

export async function salonAction(
  pin: string,
  action: string,
  bookingId?: string,
  chairId?: string,
  value?: Json,
): Promise<Record<string, unknown>> {
  const args: {
    pin: string;
    action: string;
    booking_id?: string;
    chair_id?: string;
    value?: Json;
  } = { pin, action };
  if (bookingId !== undefined) args.booking_id = bookingId;
  if (chairId !== undefined) args.chair_id = chairId;
  if (value !== undefined) args.value = value;
  const { data, error } = await rpc("salon_action", args);
  if (error) throw rpcError(error.message);
  return data as Record<string, unknown>;
}

export function roundToFive(minutes: number) {
  return Math.max(0, Math.round(minutes / 5) * 5);
}

export function minutesUntil(timestamp: string, now = Date.now()) {
  return Math.max(0, (new Date(timestamp).getTime() - now) / 60_000);
}

export function formatMinutes(minutes: number) {
  const rounded = roundToFive(minutes);
  if (rounded < 60) return `about ${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return `about ${hours} hr${hours === 1 ? "" : "s"}${rest ? ` ${rest} min` : ""}`;
}

export function formatMinuteRange(lowMinutes: number, highMinutes: number) {
  return `usually ${roundToFive(lowMinutes)} to ${roundToFive(highMinutes)} min`;
}

const johannesburgClock = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const johannesburgOpening = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatClock(timestamp: string) {
  return johannesburgClock.format(new Date(timestamp));
}

export function formatClockRange(start: string, end: string) {
  return `around ${formatClock(start)} to ${formatClock(end)}`;
}

export function formatOpening(timestamp: string) {
  return johannesburgOpening.format(new Date(timestamp));
}

export const isAtRisk = (row: PlannerFlags) => row.at_risk === true;
export const isAfterClosing = (row: PlannerFlags) => row.after_closing === true;
export const isRunningOver = (row: PlannerFlags) => row.running_over === true;

export function comeCloser(row: PlannerFlags, comeCloserMinutes: number, now = Date.now()) {
  return (
    row.checked_in !== true &&
    typeof row.start_low === "string" &&
    minutesUntil(row.start_low, now) <= comeCloserMinutes
  );
}

export function almostDone(row: PlannerFlags, almostDoneMinutes: number, now = Date.now()) {
  return (
    typeof row.expected_finish === "string" &&
    minutesUntil(row.expected_finish, now) <= almostDoneMinutes
  );
}
export type Service = {
  id: string;
  name: string;
  braid_minutes: number;
  price_rands: number;
  is_special: boolean;
  sort_order: number;
};

export type PublicSettings = {
  prep_minutes: number;
  grace_minutes: number;
  come_closer_minutes: number;
  almost_done_minutes: number;
  default_open_time: string;
};

export type SalonState = {
  last_event_type: string | null;
  last_event_at: string | null;
  version: number;
};

export type BookingInput = {
  parent_name: string;
  phone: string;
  child_name: string;
  child_age: number;
  service_id: string;
  needs_wash: boolean;
  mani_pedi: boolean;
  waiting_pref?: string | undefined;
  note?: string | undefined;
};

export type BookResult = { code?: string; refused?: boolean; message?: string };

export const WASH_PRICE_RANDS = 80;

export async function getServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .from(servicesTable())
    .select("id,name,braid_minutes,price_rands,is_special,sort_order")
    .eq("active", true)
    .order("sort_order");
  if (error) throw rpcError(error.message);
  return data ?? [];
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const { data, error } = await supabase
    .from(settingsView())
    .select("prep_minutes,grace_minutes,come_closer_minutes,almost_done_minutes,default_open_time")
    .single();
  if (error) throw rpcError(error.message);
  return {
    prep_minutes: data.prep_minutes ?? 40,
    grace_minutes: data.grace_minutes ?? 15,
    come_closer_minutes: data.come_closer_minutes ?? 30,
    almost_done_minutes: data.almost_done_minutes ?? 30,
    default_open_time: (data.default_open_time ?? "08:00").slice(0, 5),
  };
}

export async function getSalonState(): Promise<SalonState> {
  const { data, error } = await supabase
    .from(stateTable())
    .select("last_event_type,last_event_at,version")
    .eq("id", 1)
    .single();
  if (error) throw rpcError(error.message);
  return data;
}

export async function cancelBooking(code: string): Promise<{ ok?: boolean; message?: string }> {
  const { data, error } = await rpc("cancel_booking", { code });
  if (error) throw rpcError(error.message);
  return data as { ok?: boolean; message?: string };
}

export async function bookPlace(input: BookingInput): Promise<BookResult> {
  const args: Record<string, unknown> = { ...input };
  if (!args["waiting_pref"]) delete args["waiting_pref"];
  if (!args["note"]) delete args["note"];
  const { data, error } = await rpc("book_place", args as { parent_name: string; phone: string; child_name: string; child_age: number; service_id: string; needs_wash: boolean; mani_pedi: boolean; waiting_pref?: string; note?: string });
  if (error) throw rpcError(error.message);
  return data as BookResult;
}

// Saves WhatsApp consent for a just-made booking. Never blocks the booking: failures return false.
export async function recordWhatsAppConsent(code: string, phone: string): Promise<boolean> {
  try {
    const { data, error } = await rpc("record_whatsapp_consent", { code, phone });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function findBooking(phone: string, childName: string): Promise<string | null> {
  const { data, error } = await rpc("find_booking", { phone, child_name: childName });
  if (error) throw rpcError(error.message);
  const r = data as { found?: boolean; code?: string };
  return r?.found && r.code ? r.code : null;
}

export function formatDuration(minutes: number) {
  const r = roundToFive(minutes);
  if (r < 60) return `about ${r} min`;
  const h = Math.floor(r / 60);
  const m = r % 60;
  return `about ${h} hr${m ? ` ${m}` : ""}`;
}

export function formatPhone(digits: string) {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(" ");
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export type SavedBooking = { code: string; child: string };
const SAVED_KEY = "crowned_bookings";

export function getSavedBookings(): SavedBooking[] {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((x) => x && typeof x.code === "string") : [];
  } catch {
    return [];
  }
}

export function saveBooking(entry: SavedBooking) {
  if (isPractice()) return;
  const rest = getSavedBookings().filter((b) => b.code !== entry.code);
  localStorage.setItem(SAVED_KEY, JSON.stringify([entry, ...rest].slice(0, 10)));
}
