import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { simulateDemoWa } from "@/lib/whatsapp-demo";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { ArrowDown, ArrowUp, Check, Copy, MessageCircle, Plus, Settings, TriangleAlert } from "lucide-react";
import { CrownedHeader } from "@/components/crowned-header";
import { DemoControls } from "@/components/demo-controls";
import { QueueActions } from "@/components/queue-actions";
import { StickyActionBar } from "@/components/sticky-action-bar";
import { PinGate } from "@/components/salon/pin-gate";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useLive } from "@/hooks/use-live";
import { useNow } from "@/hooks/use-now";
import {
  comeCloser,
  formatClock,
  formatClockRange,
  formatDuration,
  getOptions,
  getPublicSettings,
  getServices,
  minutesUntil,
  ordinal,
  type BookingOption,
  type PublicSettings,
  type Service,
} from "@/lib/api";
import {
  act,
  bookedMessage,
  clearPin,
  comeCloserMessage,
  firstName,
  getExtras,
  getSalonList,
  PREF_LABEL,
  riskMessage,
  SOURCE_LABEL,
  waLink,
  type AfterClosingRow,
  type SalonBooking,
  type SalonChair,
  type SalonExtras,
  type SalonList,
} from "@/lib/salon";
import { isPractice } from "@/lib/practice";
import { getWhatsAppStatus, retryWhatsApp, type WaInfo, type WaMap } from "@/lib/whatsapp";
import { sendDueWhatsApp } from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/salon/")({
  head: () => ({
    meta: [
      { title: "Salon floor — Crowned" },
      { name: "description", content: "Run Zama's Braids live salon floor: chairs, today's line and one-tap actions." },
      { property: "og:title", content: "Salon floor — Crowned" },
      {
        property: "og:description",
        content: "Run Zama's Braids live salon floor: chairs, today's line and one-tap actions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <MotionConfig reducedMotion="user">
      <PinGate>{(pin) => <Floor pin={pin} />}</PinGate>
    </MotionConfig>
  ),
});

type Data = {
  list: SalonList;
  extras: SalonExtras;
  services: Service[];
  settings: PublicSettings;
  opts: BookingOption[];
  optsWash: BookingOption[];
  wa: WaMap | null;
};
const WAITING = ["booked", "called"];
const UNDOABLE = new Set(["start", "finish", "add_delay", "no_show", "finish_today"]);

async function copy(text: string, what = "Message copied. Paste it into WhatsApp.") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("Couldn't copy on this device. Use Open WhatsApp instead.");
  }
}

function WhatsAppStatus({ b, info, onRetry }: { b: SalonBooking; info: WaInfo | undefined; onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false);
  if (!info || !info.has_number)
    return <p className="mt-1 px-1 text-[13px] font-bold text-stone">WhatsApp: No number</p>;
  if (info.status === "failed")
    return (
      <div className="mt-1 rounded-xl bg-clay/10 p-2 text-[13px]">
        <p className="font-bold text-clay">WhatsApp failed</p>
        <p className="text-stone">{info.error ?? "The message didn't go through."}</p>
        <div className="mt-2 flex gap-2">
          {b.phone && (
            <Button variant="outline" asChild>
              <a href={`tel:${b.phone}`}>Call</a>
            </Button>
          )}
          <Button
            variant="outline"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              void onRetry().finally(() => setRetrying(false));
            }}
          >
            {retrying ? "Retrying…" : "Retry"}
          </Button>
        </div>
      </div>
    );
  if (info.status === "sent") {
    const what = info.ready_sent_at ? "“your turn” sent" : info.heads_up_sent_at ? "“2 places away” sent" : "sent";
    return <p className="mt-1 px-1 text-[13px] font-bold text-sage">WhatsApp sent · {what}</p>;
  }
  return <p className="mt-1 px-1 text-[13px] text-stone">WhatsApp: nothing sent yet</p>;
}

function Floor({ pin }: { pin: string }) {
  const fetcher = useCallback(async (): Promise<Data> => {
    const [list, extras, services, settings, opts, optsWash] = await Promise.all([
      getSalonList(pin),
      getExtras(pin),
      getServices(),
      getPublicSettings(),
      getOptions(false),
      getOptions(true),
    ]);
    // Real salon only: send any due WhatsApp call-backs (backend decides and claims each once), then read their status.
    let wa: WaMap | null = null;
    if (!isPractice()) {
      await sendDueWhatsApp({ data: { token: pin } }).catch(() => undefined);
      wa = await getWhatsAppStatus(pin).catch(() => null);
    }
    return { list, extras, services, settings, opts, optsWash, wa };
  }, [pin]);
  const { data, error, refresh } = useLive(fetcher);
  const [practice, setPractice] = useState(false);
  useEffect(() => setPractice(isPractice()), []);
  const [demoRetried, setDemoRetried] = useState<Set<string>>(() => new Set());
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [moveRow, setMoveRow] = useState<{ id: string; parent: string; child: string } | null>(null);
  const [pickChair, setPickChair] = useState<SalonChair | null>(null);
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const dataRef = useRef(data);
  dataRef.current = data;

  const run = useCallback(
    async (
      action: string,
      label: string,
      opts: { booking?: string; chair?: string; value?: Json | undefined } = {},
    ) => {
      if (busy) return;
      if (action === "start") navigator.vibrate?.(8);
      setBusy(true);
      const before = dataRef.current?.list;
      try {
        const res = await act(pin, action, opts);
        if (!res.ok) {
          toast.error(res.message ?? "That didn't work.");
          return;
        }
        const after = await getSalonList(pin);
        await refresh();
        let moved = 0;
        if (before)
          for (const b of after.bookings) {
            const old = before.bookings.find((x) => x.id === b.id);
            if (
              old &&
              WAITING.includes(b.status) &&
              old.expected_start &&
              b.expected_start &&
              Math.abs(new Date(old.expected_start).getTime() - new Date(b.expected_start).getTime()) >= 60_000
            )
              moved++;
          }
        const riskNew = after.counts.at_risk - (before?.counts.at_risk ?? 0);
        const parts = [label];
        if (moved) parts.push(`${moved} ${moved === 1 ? "family" : "families"} updated.`);
        toast.success(
          parts.join(" "),
          UNDOABLE.has(action)
            ? {
                duration: 5000,
                action: {
                  label: "Undo",
                  onClick: () =>
                    void act(pin, "undo").then((r) => {
                      r.ok ? toast("Undone.") : toast.error(r.message ?? "Couldn't undo.");
                      void refresh();
                    }),
                },
              }
            : undefined,
        );
        if (riskNew > 0)
          toast.warning(
            `${riskNew} ${riskNew === 1 ? "booking" : "bookings"} now at risk of finishing after ${formatClock(after.salon_day.closes_at)}.`,
          );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That didn't work.");
      } finally {
        setBusy(false);
      }
    },
    [busy, pin, refresh],
  );

  if (error && !data) {
    const wrong = /pin/i.test(error.message);
    return (
      <main className="min-h-screen p-6">
        <p className="font-semibold">{wrong ? "Your PIN has changed." : error.message}</p>
        <Button
          className="mt-4"
          onClick={() => {
            clearPin();
            location.reload();
          }}
        >
          Enter PIN again
        </Button>
      </main>
    );
  }
  if (!data)
    return (
      <main className="min-h-screen bg-background">
        <CrownedHeader />
        <p className="px-5 text-stone">Loading the floor…</p>
      </main>
    );

  const { list, extras, opts } = data;
  const closes = formatClock(list.salon_day.closes_at);
  const waiting = list.bookings
    .filter((b) => WAITING.includes(b.status))
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  const demoWa = practice ? simulateDemoWa(waiting, demoRetried) : {};
  const inChair = list.bookings.filter((b) => b.status === "in_chair");
  const ready = list.bookings.filter((b) => b.status === "ready");
  const risky = list.bookings.filter((b) => b.at_risk && !b.finish_today_confirmed && b.status !== "ready");
  const fullyBooked = opts.length > 0 && opts.every((o) => !o.fits);
  const byId = new Map(list.bookings.map((b) => [b.id, b]));
  const nextCheckedIn = waiting.find((b) => b.checked_in);
  const afterClosingNow = now >= new Date(list.salon_day.closes_at).getTime();
  const afterRows: (AfterClosingRow & { today?: boolean })[] = [
    ...list.after_closing,
    ...(afterClosingNow
      ? list.bookings
          .filter((b) => ["booked", "called", "in_chair"].includes(b.status) && !b.finish_today_confirmed)
          .map((b) => ({ ...b, label_date: list.salon_day.label_date, today: true }))
      : []),
  ];

  // Next move
  let next: { text: string; button?: { label: string; onClick: () => void } } = { text: "All calm." };
  const freeChair = list.chairs.find((c) => !c.current_booking_id);
  const graceUp = waiting.find(
    (b) => b.status === "called" && b.grace_ends_at && new Date(b.grace_ends_at).getTime() <= now,
  );
  const closer = waiting.find(
    (b) => b.status === "booked" && comeCloser(b, data.settings.come_closer_minutes, now) && !copied[b.id],
  );
  if (risky[0]) {
    const r = risky[0];
    next = {
      text: `At risk: ${r.child_name} may finish after ${closes}.`,
      button: {
        label: "Copy WhatsApp message",
        onClick: () => void copy(riskMessage(r.parent_name, r.child_name, list.salon_day.closes_at, false)),
      },
    };
  } else if (graceUp) {
    next = {
      text: `Grace is up for ${graceUp.child_name}.`,
      button: {
        label: "Mark no-show",
        onClick: () => void run("no_show", `${graceUp.child_name} marked as a no-show.`, { booking: graceUp.id }),
      },
    };
  } else if (freeChair && nextCheckedIn) {
    next = {
      text: `${freeChair.label} is free. Start ${nextCheckedIn.child_name} (with the dedicated adult helper in the playroom).`,
      button: {
        label: "Start",
        onClick: () =>
          void run("start", `${nextCheckedIn.child_name} started in ${freeChair.label}.`, {
            booking: nextCheckedIn.id,
            chair: freeChair.id,
          }),
      },
    };
  } else if (closer) {
    next = {
      text: `Tell ${firstName(closer.parent_name)} to come closer for ${closer.child_name}.`,
      button: {
        label: "Copy WhatsApp message",
        onClick: () => {
          setCopied((c) => ({ ...c, [closer.id]: true }));
          void copy(comeCloserMessage(closer, now));
        },
      },
    };
  } else {
    const soonest = inChair
      .map((b) => b.expected_finish)
      .filter(Boolean)
      .sort()[0];
    next = {
      text: soonest
        ? `All calm. Next chair frees in ${formatDuration(minutesUntil(soonest, now))}.`
        : freeChair
          ? `All calm. ${freeChair.label} is free.`
          : "All calm.",
    };
  }

  return (
    <main
      className={
        window.name === "crowned-practice"
          ? "bg-background pb-[calc(104px+env(safe-area-inset-bottom))]"
          : "min-h-[100svh] bg-background pb-[calc(104px+env(safe-area-inset-bottom))]"
      }
    >
      <div className="sticky top-0 z-30 mx-auto flex max-w-6xl items-center justify-between border-b border-border bg-background/95 pr-5 backdrop-blur">
        <CrownedHeader />
        <Link to="/salon/settings" className="inline-flex min-h-12 items-center gap-2 font-semibold text-stone">
          <Settings className="size-5" />
          Settings
        </Link>
      </div>
      <div className="mx-auto max-w-6xl space-y-5 px-4 sm:px-8">
        {/* Today strip */}
        <section className="rounded-2xl border border-border bg-shell p-4">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-[15px] tabular-nums">
            <Stat label="done" value={list.counts.girls_done} />
            <Stat label="avg wait" value={extras.avg_wait_minutes == null ? "—" : `${extras.avg_wait_minutes} min`} />
            <Stat label="no-shows" value={list.counts.no_shows} />
            <Stat
              label="on-time estimates"
              value={extras.accuracy_percent == null ? "—" : `${extras.accuracy_percent}%`}
            />
            {fullyBooked && (
              <span className="rounded-full bg-muted px-3 py-1 text-[13px] font-bold">Fully booked for today</span>
            )}
          </div>
          <p className="mt-2 text-[17px]">
            <b>
              Your taps today:{" "}
              <motion.span
                key={list.counts.taps_today}
                initial={{ opacity: 0.45, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-block font-display tabular-nums text-[28px] font-semibold"
              >
                {list.counts.taps_today}
              </motion.span>
            </b>{" "}
            <span className="text-stone">· The app handled the rest.</span>
          </p>
          <p className="mt-1 text-[13px] text-stone">
            Today: {formatClock(list.salon_day.opens_at)} to {closes}
            {list.salon_day.is_demo ? " · demo day" : ""}
          </p>
        </section>

        {/* Next move */}
        <section className="rounded-2xl bg-primary p-5 text-primary-foreground">
          <p className="label text-gold">Next move</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={next.text}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              <p className="mt-1 font-display text-[27px] font-medium leading-tight">{next.text}</p>
              {next.button && (
                <Button
                  size="lg"
                  variant="secondary"
                  className="mt-4 w-full bg-background text-primary"
                  disabled={busy}
                  onClick={next.button.onClick}
                >
                  {next.button.label}
                </Button>
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        <AnimatePresence initial={false}>
          {risky.length > 0 && (
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-tobacco bg-shell p-4"
            >
              <h2 className="flex items-center gap-2 text-[22px] font-bold text-amber">
                <TriangleAlert className="size-6" />
                At risk: {risky.length} {risky.length === 1 ? "booking" : "bookings"} may finish after {closes}
              </h2>
              <div className="mt-3 space-y-3">
                {risky.map((b) => (
                  <RiskRow
                    key={b.id}
                    row={b}
                    closesAt={list.salon_day.closes_at}
                    busy={busy}
                    onFinish={() => void run("finish_today", `${b.child_name} is staying late.`, { booking: b.id })}
                    onMove={() => setMoveRow({ id: b.id, parent: b.parent_name, child: b.child_name })}
                  />
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <section>
              <h2 className="mb-2 text-[22px] font-bold">Chairs</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                {list.chairs.map((c) => {
                  const b = c.current_booking_id ? byId.get(c.current_booking_id) : undefined;
                  return (
                    <motion.div layout key={c.id} transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}>
                      <ChairCard
                        chair={c}
                        booking={b}
                        now={now}
                        busy={busy}
                        onDelay={() => void run("add_delay", `${c.label} +15 min.`, { chair: c.id, value: 15 })}
                        onFinish={() =>
                          b && void run("finish", `${b.child_name} is finished in ${c.label}.`, { booking: b.id })
                        }
                        onStart={() =>
                          nextCheckedIn
                            ? void run("start", `${nextCheckedIn.child_name} started in ${c.label}.`, {
                                booking: nextCheckedIn.id,
                                chair: c.id,
                              })
                            : setPickChair(c)
                        }
                        nextName={nextCheckedIn?.child_name}
                      />
                    </motion.div>
                  );
                })}
              </div>
            </section>
            {ready.length > 0 && (
              <section>
                <h2 className="mb-2 text-[22px] font-bold">Ready to collect</h2>
                <div className="space-y-2">
                  {ready.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-3 rounded-2xl bg-shell p-4">
                      <div>
                        <p className="font-bold">
                          {b.child_name} <span className="font-normal text-stone">· {firstName(b.parent_name)}</span>
                        </p>
                        <p className="text-[15px] text-sage tabular-nums">
                          Ready{" "}
                          {b.finished_at
                            ? `${Math.round((now - new Date(b.finished_at).getTime()) / 60000)} min ago`
                            : ""}
                        </p>
                      </div>
                      <Button
                        size="lg"
                        disabled={busy}
                        onClick={() => void run("collected", `${b.child_name} collected.`, { booking: b.id })}
                      >
                        Collected
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <section>
            <h2 className="mb-2 text-[22px] font-bold">
              Today's line <span className="text-stone tabular-nums">({waiting.length})</span>
            </h2>
            {waiting.length === 0 && (
              <p className="rounded-2xl bg-shell p-4 text-stone">Nobody waiting. New bookings appear here.</p>
            )}
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {waiting.map((b, i) => (
                  <motion.div
                    layout
                    key={b.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ layout: { duration: 0.36, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.24 } }}
                  >
                    <LineRow
                      b={b}
                      now={now}
                      busy={busy}
                      first={i === 0}
                      last={i === waiting.length - 1}
                      alerted={comeCloser(b, data.settings.come_closer_minutes, now)}
                      run={run}
                    />
                    {practice ? (
                      <>
                        <WhatsAppStatus
                          b={b}
                          info={demoWa[b.id]}
                          onRetry={async () => {
                            await new Promise((r) => setTimeout(r, 700));
                            setDemoRetried((s) => new Set(s).add(b.id));
                          }}
                        />
                        <p className="px-1 text-[11px] text-stone">Simulated on the practice salon</p>
                      </>
                    ) : data.wa ? (
                      <WhatsAppStatus
                        b={b}
                        info={data.wa[b.id]}
                        onRetry={async () => {
                          await retryWhatsApp(pin, b.id);
                          await refresh();
                        }}
                      />
                    ) : null}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        </div>

        {afterRows.length > 0 && (
          <section className="rounded-2xl border-2 border-amber bg-shell p-4">
            <h2 className="text-[22px] font-bold text-amber">After closing</h2>
            <p className="text-[15px] text-stone">
              Not finished and not decided yet. Nothing changes until you choose.
            </p>
            <div className="mt-3 space-y-3">
              {afterRows.map((r) => (
                <div key={r.id} className="rounded-xl bg-background p-3">
                  <p className="font-bold">
                    {r.child_name}{" "}
                    <span className="font-normal text-stone">
                      · {firstName(r.parent_name)} · {r.today ? "today" : r.label_date} · {r.status.replace("_", " ")}
                    </span>
                  </p>
                  <RiskButtons
                    parent={r.parent_name}
                    child={r.child_name}
                    phone={r.phone}
                    closesAt={list.salon_day.closes_at}
                    busy={busy}
                    onFinish={() => void run("finish_today", `${r.child_name} is staying late.`, { booking: r.id })}
                    onMove={() => setMoveRow({ id: r.id, parent: r.parent_name, child: r.child_name })}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <StickyActionBar>
        <div className="mx-auto grid min-h-[72px] max-w-6xl grid-cols-[auto_minmax(0,1fr)] items-center gap-2 px-3 sm:px-8">
          {list.salon_day.is_demo && <DemoControls pin={pin} onChanged={refresh} compact />}
          <Button size="lg" className="min-w-0 justify-self-end px-4" onClick={() => setNewOpen(true)}>
            <Plus className="size-5" />
            New booking
          </Button>
        </div>
      </StickyActionBar>

      <NewBooking open={newOpen} onOpenChange={setNewOpen} data={data} pin={pin} refresh={refresh} />
      <MoveSheet
        row={moveRow}
        onClose={() => setMoveRow(null)}
        busy={busy}
        onConfirm={(note) => {
          const r = moveRow!;
          setMoveRow(null);
          void run("move_other_day", `${r.child} moved to another day.`, { booking: r.id, value: note });
        }}
      />
      <Drawer open={!!pickChair} onOpenChange={(o) => !o && setPickChair(null)}>
        <DrawerContent className="mx-auto max-w-lg p-5">
          <DrawerTitle className="text-[22px]">Start who in {pickChair?.label}?</DrawerTitle>
          <p className="text-[15px] text-stone">Nobody is checked in yet. Starting marks her as here.</p>
          <div className="mt-3 space-y-2 pb-4">
            {waiting.map((b) => (
              <Button
                key={b.id}
                variant="outline"
                size="lg"
                className="w-full justify-between"
                onClick={() => {
                  const c = pickChair!;
                  setPickChair(null);
                  void run("start", `${b.child_name} started in ${c.label}.`, { booking: b.id, chair: c.id });
                }}
              >
                <span>
                  {b.child_name} · {b.style}
                </span>
                <span className="text-stone">{b.position ? ordinal(b.position) : ""}</span>
              </Button>
            ))}
            {waiting.length === 0 && <p className="text-stone">Nobody is waiting.</p>}
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <b className="text-[17px]">{value}</b> <span className="text-stone">{label}</span>
    </span>
  );
}

function RiskButtons({
  parent,
  child,
  phone,
  closesAt,
  busy,
  onFinish,
  onMove,
}: {
  parent: string;
  child: string;
  phone: string | null;
  closesAt: string;
  busy: boolean;
  onFinish: () => void;
  onMove: () => void;
}) {
  const [priority, setPriority] = useState(false);
  const text = riskMessage(parent, child, closesAt, priority);
  return (
    <div className="mt-2 space-y-2">
      <label className="flex min-h-12 items-center justify-between gap-3 text-[15px]">
        <span>
          Offer a priority place <span className="text-stone">(only if you choose)</span>
        </span>
        <Switch checked={priority} onCheckedChange={setPriority} />
      </label>
      <QueueActions>
        <Button variant="outline" onClick={() => void copy(text)}>
          <Copy className="size-4" />
          Copy WhatsApp message
        </Button>
        <Button variant="outline" asChild>
          <a href={waLink(phone, text)} target="_blank" rel="noreferrer">
            <MessageCircle className="size-4" />
            Open WhatsApp
          </a>
        </Button>
        <Button disabled={busy} onClick={onFinish}>
          Finish today
        </Button>
        <Button variant="outline" disabled={busy} onClick={onMove}>
          Move to another day
        </Button>
      </QueueActions>
      <p className="text-[13px] text-stone">You send this yourself. The app sends nothing.</p>
    </div>
  );
}

function RiskRow({
  row,
  closesAt,
  busy,
  onFinish,
  onMove,
}: {
  row: SalonBooking;
  closesAt: string;
  busy: boolean;
  onFinish: () => void;
  onMove: () => void;
}) {
  return (
    <div className="rounded-xl bg-background p-3">
      <p className="font-bold">
        {row.child_name}{" "}
        <span className="font-normal text-stone">
          · {row.style} ·{" "}
          {row.position ? `${ordinal(row.position)} in line` : row.status === "in_chair" ? "in the chair" : ""}
        </span>
      </p>
      {row.expected_finish && row.finish_high && (
        <p className="text-[15px] tabular-nums text-amber">
          Finish {formatClockRange(row.expected_finish, row.finish_high)}
        </p>
      )}
      <RiskButtons
        parent={row.parent_name}
        child={row.child_name}
        phone={row.phone}
        closesAt={closesAt}
        busy={busy}
        onFinish={onFinish}
        onMove={onMove}
      />
    </div>
  );
}

function ChairCard({
  chair,
  booking,
  now,
  busy,
  onDelay,
  onFinish,
  onStart,
  nextName,
}: {
  chair: SalonChair;
  booking: SalonBooking | undefined;
  now: number;
  busy: boolean;
  onDelay: () => void;
  onFinish: () => void;
  onStart: () => void;
  nextName: string | undefined;
}) {
  if (!chair.current_booking_id || !booking) {
    return (
      <div className="flex flex-col justify-between rounded-2xl border-2 border-dashed border-border bg-shell p-4">
        <div>
          <p className="text-[13px] font-bold uppercase text-stone">
            {chair.label} · {chair.braider_name}
          </p>
          <p className="mt-1 text-[22px] font-bold text-sage">Free</p>
        </div>
        <Button size="lg" className="mt-3 w-full" disabled={busy} onClick={onStart}>
          {nextName ? `Start ${nextName}` : "Start next"}
        </Button>
      </div>
    );
  }
  const planned = (chair.planned_minutes ?? 0) + chair.delay_minutes;
  const started = chair.started_at ? new Date(chair.started_at).getTime() : now;
  const elapsed = (now - started) / 60000;
  const left = planned - elapsed;
  const pct = Math.min(100, Math.max(0, (elapsed / Math.max(planned, 1)) * 100));
  return (
    <div className="queue-card min-w-0 overflow-hidden rounded-2xl border border-border bg-shell p-3 sm:p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_56px] items-start gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold uppercase text-stone">
            {chair.label} · {chair.braider_name}
          </p>
          <p className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-1 font-display text-[24px] font-semibold leading-6">
            <span className="min-w-0 break-words">{booking.child_name},</span>
            <span className="shrink-0 font-sans tabular-nums text-[18px] font-bold">{booking.child_age}</span>
            {booking.at_risk && !booking.finish_today_confirmed && (
              <span className="col-span-2 inline-block size-3 rounded-full bg-tobacco" aria-label="At risk" />
            )}
          </p>
          <p className="text-[15px] text-stone">
            {booking.style}
            {booking.needs_wash ? " + wash" : ""}
          </p>
        </div>
        <svg
          className="size-14 -rotate-90 justify-self-end"
          viewBox="0 0 44 44"
          role="img"
          aria-label={`${Math.round(pct)}% complete`}
        >
          <circle cx="22" cy="22" r="18" fill="none" stroke="var(--muted)" strokeWidth="5" />
          <motion.circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke={left < 0 ? "var(--tobacco)" : "var(--gold)"}
            strokeWidth="5"
            strokeLinecap="round"
            pathLength="100"
            initial={false}
            animate={{ strokeDasharray: `${pct} ${100 - pct}` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      </div>
      <p className={`mt-2 font-bold tabular-nums ${left < 0 ? "text-tobacco" : ""}`}>
        {left < 0 ? `running ${Math.round(-left)} min over` : `${formatDuration(left)} left`}
      </p>
      {booking.finish_today_confirmed && <p className="text-[13px] font-bold text-sage">Staying late</p>}
      {booking.note && <p className="text-[13px] text-stone">“{booking.note}”</p>}
      <QueueActions className="mt-3">
        <Button variant="secondary" size="lg" disabled={busy} onClick={onDelay}>
          +15 min
        </Button>
        <Button size="lg" disabled={busy} onClick={onFinish}>
          Finish
        </Button>
      </QueueActions>
    </div>
  );
}

function LineRow({
  b,
  now,
  busy,
  first,
  last,
  alerted,
  run,
}: {
  b: SalonBooking;
  now: number;
  busy: boolean;
  first: boolean;
  last: boolean;
  alerted: boolean;
  run: (a: string, l: string, o?: { booking?: string; value?: Json | undefined }) => Promise<void>;
}) {
  const graceLeft = b.grace_ends_at ? (new Date(b.grace_ends_at).getTime() - now) / 1000 : null;
  const graceOver = graceLeft !== null && graceLeft <= 0;
  const msg = comeCloserMessage(b, now);
  return (
    <div className="queue-card min-h-[140px] rounded-2xl bg-shell p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[17px] font-bold">
            <span className="tabular-nums text-stone">{b.position ?? ""}.</span> {b.child_name}, {b.child_age}{" "}
            <span className="font-normal text-stone">· {firstName(b.parent_name)}</span>
          </p>
          <p className="text-[15px]">
            {b.style}
            {b.needs_wash && <span className="ml-2 rounded-full bg-muted px-2 text-[13px] font-bold">wash</span>}
            {b.waiting_pref && <span className="ml-2 text-[13px]">{PREF_LABEL[b.waiting_pref]}</span>}
          </p>
          {b.start_low && b.start_high && (
            <p className="text-[15px] tabular-nums text-stone">Chair {formatClockRange(b.start_low, b.start_high)}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Move up"
            disabled={busy || first}
            onClick={() => void run("move_up", `${b.child_name} moved up.`, { booking: b.id })}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Move down"
            disabled={busy || last}
            onClick={() => void run("move_down", `${b.child_name} moved down.`, { booking: b.id })}
          >
            <ArrowDown />
          </Button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[13px] font-bold">
        <span className="rounded-full bg-muted px-2 py-0.5">{SOURCE_LABEL[b.source] ?? b.source}</span>
        {b.checked_in ? (
          <span className="rounded-full bg-sage/15 px-2 py-0.5 text-sage">with playroom helper</span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-stone">not here yet</span>
        )}
        {alerted && !b.checked_in && b.status === "booked" && (
          <span className="rounded-full bg-gold/20 px-2 py-0.5 text-deep-gold">alerted: come closer</span>
        )}
        {b.status === "called" && (
          <span
            className={`rounded-full px-2 py-0.5 tabular-nums ${graceOver ? "bg-clay/15 text-clay" : "bg-gold/20 text-deep-gold"}`}
          >
            {graceOver
              ? "grace is up"
              : `called · ${Math.floor(graceLeft! / 60)}:${String(Math.floor(graceLeft! % 60)).padStart(2, "0")} left`}
          </span>
        )}
        {b.at_risk && !b.finish_today_confirmed && (
          <span className="rounded-full bg-amber/15 px-2 py-0.5 text-amber">at risk</span>
        )}
        {b.finish_today_confirmed && (
          <span className="rounded-full bg-sage/15 px-2 py-0.5 text-sage">staying late</span>
        )}
      </div>
      {b.note && <p className="mt-1 text-[13px] text-stone">“{b.note}”</p>}
      <QueueActions className="mt-3">
        {b.status === "booked" ? (
          <Button
            disabled={busy}
            onClick={() => void run("call", `${b.child_name}'s family called.`, { booking: b.id })}
          >
            Call
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (graceOver || confirm(`Grace isn't over yet. Mark ${b.child_name} as a no-show anyway?`))
                void run("no_show", `${b.child_name} marked as a no-show.`, {
                  booking: b.id,
                  value: graceOver ? undefined : "confirm_early",
                });
            }}
          >
            No-show
          </Button>
        )}
        <Button
          variant="outline"
          disabled={busy || b.checked_in}
          onClick={() => void run("arrived", `${b.child_name} is here.`, { booking: b.id })}
        >
          {b.checked_in ? (
            <>
              <Check className="size-4" />
              Here
            </>
          ) : (
            "Arrived"
          )}
        </Button>
        <Button variant="outline" asChild>
          <a
            href={waLink(b.phone, msg)}
            target="_blank"
            rel="noreferrer"
            onClick={() => void navigator.clipboard?.writeText(msg).catch(() => undefined)}
            aria-label="Copy and open WhatsApp"
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
        </Button>
        <Button variant="ghost" onClick={() => void copy(msg)}>
          <Copy className="size-4" />
          Copy message
        </Button>
      </QueueActions>
    </div>
  );
}

function MoveSheet({
  row,
  onClose,
  onConfirm,
  busy,
}: {
  row: { parent: string; child: string } | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState(false);
  return (
    <Drawer
      open={!!row}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setNote("");
          setPriority(false);
        }
      }}
    >
      <DrawerContent className="mx-auto max-w-lg p-5">
        <DrawerTitle className="text-[22px]">Move {row?.child} to another day?</DrawerTitle>
        <p className="mt-1 font-semibold text-amber">Only do this if {row ? firstName(row.parent) : ""} has agreed.</p>
        <input
          value={note}
          maxLength={180}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Tuesday morning, first chair"
          className="quiet-field mt-4 h-14 w-full px-4 text-[16px]"
          aria-label="Note (optional)"
        />
        <label className="mt-3 flex min-h-12 items-center gap-3 text-[15px]">
          <input
            type="checkbox"
            className="size-6"
            checked={priority}
            onChange={(e) => setPriority(e.target.checked)}
          />
          Priority place offered (only if you made that offer)
        </label>
        <Button
          size="lg"
          className="mb-4 mt-4 w-full"
          disabled={busy}
          onClick={() => {
            onConfirm([note.trim(), priority ? "Priority place offered." : ""].filter(Boolean).join(" "));
            setNote("");
            setPriority(false);
          }}
        >
          Confirm move
        </Button>
      </DrawerContent>
    </Drawer>
  );
}

function NewBooking({
  open,
  onOpenChange,
  data,
  pin,
  refresh,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: Data;
  pin: string;
  refresh: () => Promise<void>;
}) {
  const [source, setSource] = useState<"phone" | "whatsapp" | "walk_in">("phone");
  const [serviceId, setServiceId] = useState<string>();
  const [wash, setWash] = useState(false);
  const [child, setChild] = useState("");
  const [age, setAge] = useState(7);
  const [parent, setParent] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ code: string; msg: string; position: number } | null>(null);
  const opts = wash ? data.optsWash : data.opts;
  const optFor = (id: string) => opts.find((o) => o.service_id === id);
  const chosen = serviceId ? optFor(serviceId) : undefined;
  const nothingFits = opts.length > 0 && opts.every((o) => !o.fits);
  const digits = phone.replace(/\D/g, "");
  const phoneOk = source === "walk_in" && digits.length === 0 ? true : /^0\d{9}$/.test(digits);
  const valid = !!chosen?.fits && child.trim().length > 0 && parent.trim().length > 0 && phoneOk;
  const summary = useMemo(() => {
    if (!chosen?.fits) return null;
    const now = Date.now();
    const lo = minutesUntil(chosen.start_low, now);
    const hi = minutesUntil(chosen.start_high, now);
    return {
      position: chosen.people_ahead + 1,
      wait: formatDuration((lo + hi) / 2),
      lo: formatDuration(lo).replace("about ", ""),
      hi: formatDuration(hi).replace("about ", ""),
    };
  }, [chosen]);

  const reset = () => {
    setServiceId(undefined);
    setWash(false);
    setChild("");
    setAge(7);
    setParent("");
    setPhone("");
    setError("");
    setDone(null);
    setSource("phone");
  };
  const book = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await act(pin, "new_booking", {
        value: {
          source,
          parent_name: parent.trim(),
          phone: digits || null,
          child_name: child.trim(),
          child_age: age,
          service_id: serviceId!,
          needs_wash: wash,
          mani_pedi: true,
        },
      });
      if (!res.ok || !res.code) {
        setError(res.message ?? "We're fully booked for today.");
        return;
      }
      const list = await getSalonList(pin);
      const row = list.bookings.find((b) => b.code === res.code);
      const pos = row?.position ?? summary?.position ?? 1;
      const wait = row?.expected_start ? formatDuration(minutesUntil(row.expected_start)) : (summary?.wait ?? "");
      setDone({ code: res.code, position: pos, msg: bookedMessage(parent, child.trim(), pos, wait, res.code) });
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setSaving(false);
    }
  };

  const chip = (on: boolean) =>
    `min-h-12 rounded-full border-2 px-4 text-[15px] font-bold ${on ? "border-foreground bg-foreground text-background" : "border-border bg-shell"}`;
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DrawerContent className="mx-auto max-w-lg">
        <div className="p-5">
          {done ? (
            <div>
              <DrawerTitle className="text-[22px]">Booked.</DrawerTitle>
              <p className="mt-2 text-[17px]">
                {child.trim()} has a confirmed place in today's line. She's {ordinal(done.position)}.
              </p>
              <p className="mt-3 font-display text-[32px] tracking-[0.15em]">{done.code}</p>
              <div className="mt-4 grid gap-2">
                <Button size="lg" onClick={() => void copy(done.msg)}>
                  <Copy className="size-4" />
                  Copy WhatsApp message
                </Button>
                {digits && (
                  <Button size="lg" variant="outline" asChild>
                    <a href={waLink(digits, done.msg)} target="_blank" rel="noreferrer">
                      Open WhatsApp
                    </a>
                  </Button>
                )}
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={() => {
                    onOpenChange(false);
                    reset();
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <DrawerTitle className="text-[22px]">New booking</DrawerTitle>
              <div className="flex gap-2">
                {(["phone", "whatsapp", "walk_in"] as const).map((s) => (
                  <button key={s} className={chip(source === s)} onClick={() => setSource(s)}>
                    {SOURCE_LABEL[s]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {data.services.map((s) => {
                  const o = optFor(s.id);
                  const full = !o?.fits;
                  return (
                    <button
                      key={s.id}
                      disabled={full}
                      className={`${chip(serviceId === s.id)} disabled:opacity-40`}
                      onClick={() => setServiceId(s.id)}
                    >
                      {s.name.split(" (")[0]} {full ? "· Full today" : `· R${s.price_rands}`}
                    </button>
                  );
                })}
              </div>
              <label className="flex min-h-12 items-center justify-between text-[15px] font-semibold">
                Wash and detangle (+{data.settings.prep_minutes} min)
                <Switch checked={wash} onCheckedChange={setWash} />
              </label>
              <input
                value={child}
                onChange={(e) => setChild(e.target.value)}
                maxLength={40}
                placeholder="Her first name"
                className="quiet-field h-14 w-full px-4 text-[16px]"
              />
              <div className="flex items-center justify-between">
                <span className="font-semibold">Age</span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-12"
                    onClick={() => setAge(Math.max(3, age - 1))}
                  >
                    −
                  </Button>
                  <span className="w-8 text-center text-[22px] font-bold tabular-nums">{age}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-12"
                    onClick={() => setAge(Math.min(14, age + 1))}
                  >
                    +
                  </Button>
                </div>
              </div>
              <input
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                maxLength={40}
                placeholder="Parent's name"
                className="quiet-field h-14 w-full px-4 text-[16px]"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="numeric"
                placeholder={source === "walk_in" ? "Phone (optional for walk-ins)" : "Parent's phone"}
                className="quiet-field h-14 w-full px-4 text-[16px] tabular-nums"
              />
              {!phoneOk && digits.length > 0 && (
                <p className="text-[15px] text-clay">Please enter a 10-digit number starting with 0.</p>
              )}
              <p className="min-h-6 font-semibold tabular-nums">
                {nothingFits
                  ? "Fully booked for today"
                  : summary
                    ? `She'll be ${ordinal(summary.position)} in today's line · ${summary.wait} (${summary.lo} to ${summary.hi})`
                    : "Choose a style to see her place."}
              </p>
              {error && (
                <p className="font-semibold text-clay" role="alert">
                  {error}
                </p>
              )}
              <Button
                size="lg"
                className="w-full"
                disabled={!valid || saving || nothingFits}
                onClick={() => void book()}
              >
                {saving ? "Booking…" : "Book"}
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
