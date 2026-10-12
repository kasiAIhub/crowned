import { useSyncExternalStore } from "react";

export type Service = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
};

export const SERVICES: Service[] = [
  {
    id: "knotless",
    name: "Knotless Box Braids",
    description: "Medium, shoulder length. Gentle on the edges.",
    durationMin: 240,
    price: 450,
  },
  {
    id: "cornrows",
    name: "Straight-Back Cornrows",
    description: "8–10 lines, neat and school ready.",
    durationMin: 90,
    price: 180,
  },
  {
    id: "twists",
    name: "Two-Strand Twists",
    description: "Soft twists with braid hair, mid-length.",
    durationMin: 150,
    price: 300,
  },
  {
    id: "fulani",
    name: "Fulani Braids with Beads",
    description: "Patterned braids, beads included.",
    durationMin: 180,
    price: 380,
  },
  {
    id: "wash",
    name: "Wash, Blow & Plait",
    description: "Wash day treatment and simple plaits.",
    durationMin: 60,
    price: 150,
  },
];

export const PREFERENCES = [
  { id: "show", label: "Show on the playroom TV" },
  { id: "game", label: "Games in the playroom" },
  { id: "snack", label: "Juice & snack" },
] as const;

export type Status = "waiting" | "arrived" | "in_chair" | "done" | "no_show";

export type Entry = {
  id: string;
  parentName: string;
  phone: string;
  childName: string;
  childAge: number | "";
  serviceId: string;
  preference: string | null;
  note?: string;
  status: Status;
  joinedAt: number;
  startedAt?: number;
  finishedAt?: number;
  delayMin: number;
};

export type State = { entries: Entry[] };

const KEY = "crowned.queue.v3";
const ME_KEY = "crowned.me.v3";
const EVT = "crowned:update";

export function serviceOf(id: string): Service {
  return SERVICES.find((s) => s.id === id) ?? SERVICES[0]!;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function seed(): State {
  const now = Date.now();
  return {
    entries: [
      {
        id: uid(),
        parentName: "Nomsa Dlamini",
        phone: "072 555 0143",
        childName: "Lethabo",
        childAge: 8,
        serviceId: "cornrows",
        preference: "show",
        note: "Tender-headed, needs breaks.",
        status: "in_chair",
        joinedAt: now - 75 * 60000,
        startedAt: now - 55 * 60000,
        delayMin: 0,
      },
      {
        id: uid(),
        parentName: "Thandi Mokoena",
        phone: "081 555 0277",
        childName: "Amahle",
        childAge: 6,
        serviceId: "fulani",
        preference: "game",
        note: "Wants pink beads.",
        status: "arrived",
        joinedAt: now - 40 * 60000,
        delayMin: 0,
      },
      {
        id: uid(),
        parentName: "Zinhle Khumalo",
        phone: "063 555 0918",
        childName: "Buhle",
        childAge: 11,
        serviceId: "knotless",
        preference: "snack",
        note: "Coming from the mall food court.",
        status: "waiting",
        joinedAt: now - 20 * 60000,
        delayMin: 0,
      },
    ],
  };
}

let state: State = { entries: [] };
let loaded = false;

function load(): State {
  if (typeof window === "undefined") return { entries: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* ignore */
  }
  const s = seed();
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  return s;
}

function ensure() {
  if (!loaded && typeof window !== "undefined") {
    state = load();
    loaded = true;
  }
  return state;
}

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setState(updater: (s: State) => State) {
  state = updater(ensure());
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  emit();
  window.dispatchEvent(new Event(EVT));
}

export function useQueue(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onExternal = () => {
        state = load();
        cb();
      };
      window.addEventListener("storage", onExternal);
      const tick = window.setInterval(cb, 15000);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onExternal);
        window.clearInterval(tick);
      };
    },
    () => ensure(),
    () => ({ entries: [] as Entry[] }),
  );
}

export function resetDemo() {
  setState(() => seed());
}

/* ---------- ETA projection ---------- */

export type Projected = Entry & {
  position: number;
  etaAt: number;
  waitMin: number;
  remainingMin: number;
};

export function project(entries: Entry[], now = Date.now()): Projected[] {
  const active = entries.find((e) => e.status === "in_chair");
  const queued = entries
    .filter((e) => e.status === "waiting" || e.status === "arrived")
    .sort((a, b) => a.joinedAt - b.joinedAt);

  const out: Projected[] = [];
  let cursor = now;

  if (active) {
    const total = (serviceOf(active.serviceId).durationMin + active.delayMin) * 60000;
    const end = (active.startedAt ?? now) + total;
    const remaining = Math.max(0, end - now);
    cursor = now + remaining;
    out.push({
      ...active,
      position: 0,
      etaAt: now,
      waitMin: 0,
      remainingMin: Math.round(remaining / 60000),
    });
  }

  queued.forEach((e, i) => {
    const dur = (serviceOf(e.serviceId).durationMin + e.delayMin) * 60000;
    out.push({
      ...e,
      position: i + 1,
      etaAt: cursor,
      waitMin: Math.max(0, Math.round((cursor - now) / 60000)),
      remainingMin: Math.round(dur / 60000),
    });
    cursor += dur;
  });

  entries
    .filter((e) => e.status === "done" || e.status === "no_show")
    .forEach((e) =>
      out.push({ ...e, position: -1, etaAt: e.finishedAt ?? now, waitMin: 0, remainingMin: 0 }),
    );

  return out;
}

export function findProjected(entries: Entry[], id: string | null) {
  if (!id) return null;
  return project(entries).find((e) => e.id === id) ?? null;
}

/* ---------- actions ---------- */

export function joinQueue(e: Omit<Entry, "id" | "status" | "joinedAt" | "delayMin">) {
  const id = uid();
  setState((s) => ({
    entries: [
      ...s.entries,
      { ...e, id, status: "waiting", joinedAt: Date.now(), delayMin: 0 },
    ],
  }));
  setMyId(id);
  return id;
}

function patch(id: string, fn: (e: Entry) => Entry) {
  setState((s) => ({ entries: s.entries.map((e) => (e.id === id ? fn(e) : e)) }));
}

export const startClient = (id: string) =>
  setState((s) => ({
    entries: s.entries.map((e) => {
      if (e.id === id) return { ...e, status: "in_chair", startedAt: Date.now() };
      if (e.status === "in_chair") return { ...e, status: "done", finishedAt: Date.now() };
      return e;
    }),
  }));

export const finishClient = (id: string) =>
  patch(id, (e) => ({ ...e, status: "done", finishedAt: Date.now() }));

export const addDelay = (id: string) => patch(id, (e) => ({ ...e, delayMin: e.delayMin + 15 }));

export const markArrived = (id: string) => patch(id, (e) => ({ ...e, status: "arrived" }));

export const markNoShow = (id: string) =>
  patch(id, (e) => ({ ...e, status: "no_show", finishedAt: Date.now() }));

export const requeue = (id: string) =>
  patch(id, (e) => ({ ...e, status: "waiting", joinedAt: Date.now() }));

/* ---------- "me" ---------- */

export function getMyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ME_KEY);
  } catch {
    return null;
  }
}

export function setMyId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(ME_KEY, id);
    else window.localStorage.removeItem(ME_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/* ---------- formatting ---------- */

export const rand = (n: number) => `R${n}`;

export function fmtDur(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function fmtClock(ts: number) {
  return new Date(ts).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}
