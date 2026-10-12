import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import {
  Bell,
  BellRing,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  Crown,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { CrownedHeader } from "@/components/crowned-header";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useLive } from "@/hooks/use-live";
import { useNow } from "@/hooks/use-now";
import {
  WASH_PRICE_RANDS,
  almostDone,
  cancelBooking,
  comeCloser,
  formatClock,
  formatClockRange,
  formatDuration,
  formatMinuteRange,
  formatMinutes,
  getBooking,
  getPublicSettings,
  getSalonState,
  minutesUntil,
  ordinal,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import turnAsset from "@/assets/2-image-0c7feae6.jpg.asset.json";
import completedAsset from "@/assets/3-image-60e6a8c5.jpg.asset.json";
import braidingAsset from "@/assets/4-image-05f787a1.jpg.asset.json";
import playroomAsset from "@/assets/5-image-65e5dfaa.jpg.asset.json";
import salonAsset from "@/assets/6-image-019cd5c8.jpg.asset.json";

type Booking = {
  found?: boolean;
  code: string;
  parent_first_name: string;
  child_name: string;
  child_age: number;
  style: string;
  minutes: number;
  price_rands: number;
  needs_wash: boolean;
  mani_pedi: boolean;
  waiting_pref: "show" | "game" | "snack" | null;
  status: "booked" | "called" | "in_chair" | "ready" | "collected" | "no_show" | "cancelled" | "moved_other_day";
  checked_in: boolean;
  finish_today_confirmed: boolean;
  moved_note: string | null;
  booked_at: string;
  called_at: string | null;
  grace_ends_at: string | null;
  braider_first_name: string | null;
  position: number | null;
  start_low: string | null;
  start_high: string | null;
  expected_finish: string | null;
  finish_high: string | null;
  at_risk: boolean;
  after_closing: boolean;
  closes_at: string;
};

type AlertMoment = "come-closer" | "your-turn" | "almost-done" | "ready" | "at-risk";
type Notice = { moment: AlertMoment; title: string; message: string };

const WAITING_PREFS = { show: "Watch a show", game: "Play a game", snack: "Have a snack" } as const;
const LAST_ESTIMATE_PREFIX = "crowned_last_estimate_";
const ALERTS_PREFIX = "crowned_alerts_";

export const Route = createFileRoute("/b/$code")({
  validateSearch: (search: Record<string, unknown>) => ({ new: search["new"] ? 1 : undefined }),
  head: () => ({
    meta: [
      { title: "Her live booking — Crowned" },
      { name: "description", content: "Follow her confirmed place and live chair estimate." },
      { property: "og:title", content: "Her live booking — Crowned" },
      { property: "og:description", content: "Follow her confirmed place and live chair estimate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BookingPage,
});

function BookingPage() {
  const { code } = Route.useParams();
  const { new: isNew } = Route.useSearch();
  const navigate = Route.useNavigate();
  const now = useNow();
  const interacted = useRef(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [change, setChange] = useState<string>();
  const [alertsMessage, setAlertsMessage] = useState<string>();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string>();

  const fetcher = useCallback(async () => {
    const [booking, settings, salonState] = await Promise.all([getBooking(code), getPublicSettings(), getSalonState()]);
    return { booking: booking as unknown as Booking, settings, salonState };
  }, [code]);
  const { data, loading, error, refresh } = useLive(fetcher);

  useEffect(() => {
    const markInteracted = () => {
      interacted.current = true;
    };
    window.addEventListener("pointerdown", markInteracted, { once: true });
    return () => window.removeEventListener("pointerdown", markInteracted);
  }, []);

  const booking = data?.booking;
  const settings = data?.settings;
  const status = booking?.status;
  const isComeCloser = Boolean(
    booking && settings && booking.status === "booked" && comeCloser(booking, settings.come_closer_minutes, now),
  );
  const isAlmostDone = Boolean(
    booking && settings && booking.status === "in_chair" && almostDone(booking, settings.almost_done_minutes, now),
  );

  useEffect(() => {
    if (!booking?.found || !data || isNew) return;
    const estimateAt =
      status === "in_chair" ? booking.expected_finish : midpoint(booking.start_low, booking.start_high);
    if (!estimateAt) return;
    const key = `${LAST_ESTIMATE_PREFIX}${booking.code}`;
    const current = new Date(estimateAt).getTime();
    const stored = localStorage.getItem(key);
    const previous = stored === null ? Number.NaN : Number(stored);
    localStorage.setItem(key, String(current));
    if (!Number.isFinite(previous)) return;
    const difference = Math.round((current - previous) / 60_000);
    if (Math.abs(difference) < 5) return;
    const event = data.salonState.last_event_type;
    let reason: string;
    if (event === "fast_forward" || event === "demo_late_day") reason = "Time moved on (demo).";
    else if (
      difference < 0 &&
      ["finished", "no_show", "cancelled", "collected", "moved_other_day"].includes(event ?? "")
    ) {
      reason = `${Math.abs(difference)} min sooner. A chair opened up.`;
    } else if (event === "delayed")
      reason = `${Math.abs(difference)} min later. A braid ahead is taking a little longer.`;
    else if (difference > 0) reason = `${difference} min later. A braid ahead is running a little over.`;
    else reason = `${Math.abs(difference)} min sooner. Her chair estimate has moved.`;
    setChange(reason);
    const timeout = window.setTimeout(() => setChange(undefined), 60_000);
    return () => window.clearTimeout(timeout);
  }, [booking, data, isNew, status]);

  const activeAlert = useMemo(() => {
    if (!booking || !settings) return undefined;
    if (booking.at_risk && !booking.finish_today_confirmed) {
      return {
        moment: "at-risk",
        title: "Booking update",
        message: "The day is running later than planned. Her place is still held.",
      } satisfies Notice;
    }
    if (status === "ready")
      return {
        moment: "ready",
        title: `${booking.child_name} is ready`,
        message: "Come collect your queen.",
      } satisfies Notice;
    if (isAlmostDone)
      return {
        moment: "almost-done",
        title: "Almost done",
        message: `Head back. ${booking.child_name} will be ready soon.`,
      } satisfies Notice;
    if (status === "called")
      return {
        moment: "your-turn",
        title: `It's ${booking.child_name}'s turn`,
        message: "Please come to the front desk.",
      } satisfies Notice;
    if (isComeCloser)
      return {
        moment: "come-closer",
        title: "Come closer",
        message: "It's time to head over to the salon.",
      } satisfies Notice;
    return undefined;
  }, [booking, isAlmostDone, isComeCloser, settings, status]);

  useEffect(() => {
    if (!booking || !activeAlert || isNew) return;
    const key = `${ALERTS_PREFIX}${booking.code}`;
    const fired = readStringList(key);
    if (fired.includes(activeAlert.moment)) return;
    localStorage.setItem(key, JSON.stringify([...fired, activeAlert.moment]));
    setNotice(activeAlert);
    document.title = `(1) ${activeAlert.title} · Crowned`;
    window.setTimeout(() => {
      document.title = "Her live booking — Crowned";
    }, 60_000);
    if (interacted.current) {
      navigator.vibrate?.([120, 80, 120]);
      playChime();
    }
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted")
        new Notification(activeAlert.title, {
          body: activeAlert.message,
          tag: `${booking.code}-${activeAlert.moment}`,
        });
    } catch {
      /* some phones don't allow page notifications */
    }
  }, [activeAlert, booking, isNew]);

  if (loading && !data)
    return (
      <Shell>
        <p className="text-muted-foreground">Opening her booking…</p>
      </Shell>
    );
  if (error && !data) return <ErrorState onRetry={refresh} />;
  if (!booking?.found) return <NotFound />;
  if (!settings) return <ErrorState onRetry={refresh} />;

  const total = booking.minutes + (booking.needs_wash ? settings.prep_minutes : 0);
  const price = booking.price_rands + (booking.needs_wash ? WASH_PRICE_RANDS : 0);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(booking.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };
  const requestAlerts = async () => {
    interacted.current = true;
    if (!("Notification" in window)) {
      setAlertsMessage("Keep this page open and we'll alert you here.");
      return;
    }
    const permission = await Notification.requestPermission();
    setAlertsMessage(
      permission === "granted" ? "Alerts are on for this phone." : "Keep this page open and we'll alert you here.",
    );
  };
  const confirmCancel = async () => {
    setCancelling(true);
    setCancelError(undefined);
    try {
      const result = await cancelBooking(booking.code);
      if (!result.ok) setCancelError(result.message ?? "We couldn't cancel this booking right now.");
      else {
        setCancelOpen(false);
        await refresh();
      }
    } catch (reason) {
      setCancelError(reason instanceof Error ? reason.message : "We couldn't cancel this booking right now.");
    } finally {
      setCancelling(false);
    }
  };

  if (isNew) {
    return (
      <Confirmation
        booking={booking}
        settings={settings}
        total={total}
        price={price}
        copied={copied}
        onCopy={copy}
        onContinue={() => void navigate({ to: ".", search: { new: undefined }, replace: true })}
      />
    );
  }

  return (
    <main className="min-h-[100svh] bg-background">
      <div className={booking.status === "called" ? "bg-olive" : ""}>
        <CrownedHeader inverse={booking.status === "called"} />
      </div>
      <AnimatePresence>
        {notice && <AlertBanner notice={notice} onClose={() => setNotice(undefined)} />}
      </AnimatePresence>
      <section className="mx-auto max-w-xl px-5 pb-16 pt-4 sm:px-8">
        <StatusLead
          booking={booking}
          settings={settings}
          now={now}
          isComeCloser={isComeCloser}
          isAlmostDone={isAlmostDone}
        />
        {booking.status === "collected" && <CollectedGallery />}

        {booking.status === "booked" && (
          <>
            <div className="mt-5 inline-flex min-h-8 items-center gap-2 rounded-full bg-sage/10 px-3 text-[13px] font-bold text-sage">
              <CircleCheck className="size-4" aria-hidden="true" /> Booked ·{" "}
              <span className="tabular-nums">{booking.code}</span>
            </div>
            <h1 className="mt-4 font-display text-[32px] font-medium leading-tight">
              Hello {booking.parent_first_name}, how are you? {booking.child_name} has a confirmed place in today's
              line.
            </h1>
            {booking.status === "booked" && <Position position={booking.position} child={booking.child_name} />}
            {booking.status === "booked" && <EstimateHero booking={booking} now={now} isComeCloser={isComeCloser} />}
            <Timeline status={booking.status} isComeCloser={isComeCloser} />
          </>
        )}

        <AnimatePresence>
          {change && (
            <motion.p
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
              className="mt-5 font-display text-[19px] italic text-muted-foreground"
              role="status"
            >
              What changed: <span className="tabular-nums text-foreground">{change}</span>
            </motion.p>
          )}
        </AnimatePresence>

        <RiskCard booking={booking} />

        {!isTerminal(booking.status) && booking.status !== "ready" && (
          <AlertSetup message={alertsMessage} onRequest={requestAlerts} />
        )}

        <BookingDetails booking={booking} total={total} price={price} />
        <SafetyCard booking={booking} />
        <BookingMeaning booking={booking} grace={settings.grace_minutes} stayClose={settings.come_closer_minutes} />

        <div className="mt-8 grid gap-2 border-t border-border pt-5">
          {canCancel(booking.status) && (
            <Button variant="ghost" size="lg" className="w-full text-clay" onClick={() => setCancelOpen(true)}>
              Cancel booking
            </Button>
          )}
          <Button asChild variant="ghost" size="lg" className="w-full">
            <Link to="/book">
              <RotateCcw aria-hidden="true" /> Book another child
            </Link>
          </Button>
        </div>
        <p className="mt-4 text-center text-[13px] leading-5 text-muted-foreground">
          Alerts appear on this page. We don't send WhatsApp or SMS messages yet.
        </p>
      </section>

      <Drawer open={cancelOpen} onOpenChange={setCancelOpen}>
        <DrawerContent className="border-border bg-shell">
          <div className="mx-auto w-full max-w-xl">
            <DrawerHeader className="px-5">
              <DrawerTitle className="text-[22px]">Cancel {booking.child_name}'s booking?</DrawerTitle>
              <DrawerDescription className="pt-2 text-[15px] leading-6">
                Her confirmed place will be released. This can't be undone.
              </DrawerDescription>
            </DrawerHeader>
            {cancelError && (
              <p className="px-5 text-[15px] text-clay" role="alert">
                {cancelError}
              </p>
            )}
            <DrawerFooter className="px-5 pb-6">
              <Button variant="destructive" size="lg" disabled={cancelling} onClick={() => void confirmCancel()}>
                {cancelling ? "Cancelling…" : "Yes, cancel booking"}
              </Button>
              <DrawerClose asChild>
                <Button variant="ghost" size="lg">
                  Keep booking
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  );
}

function Confirmation({
  booking,
  settings,
  total,
  price,
  copied,
  onCopy,
  onContinue,
}: {
  booking: Booking;
  settings: { grace_minutes: number };
  total: number;
  price: number;
  copied: boolean;
  onCopy: () => Promise<void>;
  onContinue: () => void;
}) {
  const now = useNow();
  const low = booking.start_low ? minutesUntil(booking.start_low, now) : undefined;
  const high = booking.start_high ? minutesUntil(booking.start_high, now) : undefined;
  return (
    <main className="min-h-screen bg-background">
      <CrownedHeader />
      <motion.section
        initial={false}
        className="mx-auto flex min-h-[calc(100svh-56px)] max-w-xl flex-col px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-8 sm:px-8"
      >
        <motion.svg viewBox="0 0 52 52" className="size-14 text-gold" aria-hidden="true">
          <circle cx="26" cy="26" r="22" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M15 27l7 7 15-17"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
        <h1 className="mt-4 font-display text-[48px] leading-[1.06]">You're booked.</h1>
        <p className="mt-4 text-[17px] leading-7">
          Hello {booking.parent_first_name}, how are you? {booking.child_name} has a confirmed place in today's line.
          {booking.position ? ` She's ${ordinal(booking.position)}.` : ""} We'll call you.
        </p>
        <div className="my-auto rounded-2xl bg-shell p-5 text-center">
          <p className="text-[13px] font-bold uppercase text-muted-foreground">Booking reference</p>
          <p className="mt-2 font-display tabular-nums text-[32px] tracking-[0.2em]">{booking.code}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => void onCopy()}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <p className="mt-1 text-[13px] text-muted-foreground">Save this page. It's your live booking.</p>
        </div>
        <ul className="mt-6 grid gap-2 text-[15px]">
          {["Place in today's line: confirmed", "Her chair: tracked live", `Booking reference: ${booking.code}`].map(
            (text) => (
              <li key={text} className="flex items-center gap-2">
                <Check className="size-4 text-sage" aria-hidden="true" />
                {text}
              </li>
            ),
          )}
        </ul>
        <p className="mt-4 text-[15px] leading-6">
          We expect to finish her hair today as long as you're here within {settings.grace_minutes} minutes of our call.
        </p>
        {low !== undefined && high !== undefined && (
          <p className="mt-2 tabular-nums text-[15px] leading-6">
            Time: {formatMinutes((low + high) / 2)}, {formatMinuteRange(low, high)}. This moves as our braiders work.
          </p>
        )}
        <div className="mt-6 flex items-baseline justify-between rounded-2xl border border-border p-4 text-[15px]">
          <span className="font-bold">
            {booking.style}
            {booking.needs_wash ? " + wash" : ""}
          </span>
          <span className="tabular-nums text-muted-foreground">
            {formatDuration(total)} · R{price}
          </span>
        </div>
        <Button size="lg" className="mt-8 w-full" onClick={onContinue}>
          See her live booking
        </Button>
      </motion.section>
    </main>
  );
}

function StatusLead({
  booking,
  settings,
  now,
  isComeCloser,
  isAlmostDone,
}: {
  booking: Booking;
  settings: { grace_minutes: number; come_closer_minutes: number };
  now: number;
  isComeCloser: boolean;
  isAlmostDone: boolean;
}) {
  if (booking.status === "called") {
    const left = booking.grace_ends_at ? Math.ceil(minutesUntil(booking.grace_ends_at, now)) : settings.grace_minutes;
    return (
      <TurnStatus
        child={booking.child_name}
        left={left}
        grace={settings.grace_minutes}
        checkedIn={booking.checked_in}
        graceEnded={Boolean(booking.grace_ends_at && new Date(booking.grace_ends_at).getTime() <= now)}
      />
    );
  }
  if (booking.status === "in_chair") {
    const left = booking.expected_finish ? minutesUntil(booking.expected_finish, now) : 0;
    return (
      <FullStatus
        tone="gold"
        icon={<ProgressRing value={left} total={booking.minutes} />}
        title={isAlmostDone ? "Head back." : `${formatMinutes(left)} until she's ready`}
        copy={
          isAlmostDone
            ? `${booking.child_name} will be ready in ${formatMinutes(left)}.`
            : `In the chair${booking.braider_first_name ? ` with ${booking.braider_first_name}` : ""}.`
        }
        detail="Her finish estimate moves as the braid progresses."
      />
    );
  }
  if (booking.status === "ready")
    return (
      <FullStatus
        tone="sage"
        icon={<Crown />}
        title={`${booking.child_name} is ready.`}
        copy="Come collect your queen."
      />
    );
  if (booking.status === "collected")
    return (
      <FullStatus
        tone="sage"
        icon={<GoldTick />}
        title="All done!"
        copy={`Thank you for trusting us with ${booking.child_name} today. We hope she loves her hair.`}
        photo
      />
    );
  if (booking.status === "moved_other_day")
    return (
      <FullStatus
        tone="plain"
        icon={<CircleCheck />}
        title="Moved to another day, as agreed with Zama."
        copy="She'll confirm the day with you."
        detail={booking.moved_note ?? ""}
      />
    );
  if (booking.status === "no_show")
    return (
      <FullStatus
        tone="plain"
        icon={<MapPin />}
        title={`We held ${booking.child_name}'s place for ${settings.grace_minutes} minutes after our call and had to move to the next child.`}
        copy="You can book again if today still has room."
      />
    );
  if (booking.status === "cancelled")
    return (
      <FullStatus
        tone="plain"
        icon={<X />}
        title="Your booking is cancelled."
        copy="You're welcome to book another place."
      />
    );
  if (isComeCloser) {
    const live =
      booking.start_low && booking.start_high
        ? (minutesUntil(booking.start_low, now) + minutesUntil(booking.start_high, now)) / 2
        : settings.come_closer_minutes;
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <p className="text-[17px] font-bold">Time to head over.</p>
        <p className="mt-1 text-[15px] leading-6 text-muted-foreground">
          Her chair should be ready in about {Math.max(0, Math.round(live))} minutes.
        </p>
      </motion.div>
    );
  }
  if (booking.checked_in)
    return <p className="mb-4 text-[15px] leading-6 text-sage">She's with us. We'll track her chair here.</p>;
  return (
    <p className="mb-4 text-[15px] leading-6 text-muted-foreground">
      You're booked. Go do your errands; this page will tell you when to come closer.
    </p>
  );
}

function FullStatus({
  tone,
  icon,
  title,
  copy,
  detail,
  photo = false,
}: {
  tone: "gold" | "sage" | "plain";
  icon: React.ReactNode;
  title: string;
  copy: string;
  detail?: string;
  photo?: boolean;
}) {
  return (
    <motion.div
      initial={false}
      className={cn(
        "mb-6  p-6 flex flex-col justify-center",
        tone === "gold" && "border-l-4 border-gold bg-gold/10",
        tone === "sage" && "-mx-5 bg-ready px-5 text-primary-foreground sm:-mx-8 sm:px-8",
        tone === "plain" && "bg-shell",
      )}
    >
      <div
        className={cn(
          "mb-5 [&>svg]:size-12",
          tone === "sage" ? "text-gold" : tone === "gold" ? "text-deep-gold" : "text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <h1 className="font-display text-[46px] font-medium leading-none">{title}</h1>
      <p className="mt-3 text-[17px] font-bold leading-7">{copy}</p>
      {detail && <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{detail}</p>}
      {photo && (
        <img
          src={completedAsset.url}
          alt="A smiling braider admiring a girl's freshly finished beaded braids"
          className="mt-6 aspect-square w-full rounded-2xl object-cover object-[60%_30%]"
        />
      )}
    </motion.div>
  );
}

function TurnStatus({
  child,
  left,
  grace,
  checkedIn,
  graceEnded,
}: {
  child: string;
  left: number;
  grace: number;
  checkedIn: boolean;
  graceEnded: boolean;
}) {
  const reduce = useReducedMotion();
  const sparks = [12, 27, 40, 58, 72, 86];
  return (
    <motion.section
      initial={false}
      className="relative -mx-5 -mt-4 mb-6 flex min-h-[calc(100svh-56px)] flex-col overflow-hidden bg-olive px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-8 text-primary-foreground sm:-mx-8 sm:px-8"
    >
      {!reduce &&
        !graceEnded &&
        sparks.map((leftPos, index) => (
          <motion.span
            key={leftPos}
            className="absolute bottom-1/3 size-1.5 rounded-full bg-gold"
            style={{ left: `${leftPos}%` }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 0.8, y: -40 }}
            transition={{ duration: 1.1, delay: 0.8 + index * 0.07 }}
          />
        ))}
      <div className="relative z-10 flex flex-1 flex-col items-center text-center">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 0.65, duration: 0.4 }}
        >
          <Crown className="size-10 text-gold" />
        </motion.div>
        <motion.img
          src={turnAsset.url}
          alt="A smiling girl showing her fresh beaded braids in a salon chair"
          className={cn(
            "mt-6 size-[184px] rounded-full object-cover object-[55%_35%] max-[320px]:size-[152px]",
            !graceEnded && "portrait-glow",
          )}
          initial={reduce ? false : { opacity: 0, scale: 0.86 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: reduce ? 0 : 0.72, duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
        />
        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 0.9 }}
          className="mt-7 font-display text-[44px] font-medium leading-none"
        >
          It's {child}'s turn.
        </motion.h1>
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 0.97 }}
          className="mt-4 text-[17px] font-semibold"
        >
          Please come to the front desk.
        </motion.p>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 1.04 }}
          className="mt-5 rounded-2xl border border-gold/30 px-5 py-4"
        >
          <p className="text-[15px]">
            {checkedIn ? "She's here with us." : `We're holding her place for ${grace} minutes`}
          </p>
          {!checkedIn && (
            <p className="mt-1 font-display tabular-nums text-[36px] text-gold">
              {!graceEnded && left > 0 ? `${left} min left` : "Time is up"}
            </p>
          )}
        </motion.div>
      </div>
    </motion.section>
  );
}

function GoldTick() {
  const reduce = useReducedMotion();
  return (
    <motion.svg viewBox="0 0 52 52" className="size-14 text-gold" aria-hidden="true">
      <motion.circle
        cx="26"
        cy="26"
        r="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0.15 : 0.7 }}
      />
      <motion.path
        d="M15 27l7 7 15-17"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: reduce ? 0 : 0.6, duration: reduce ? 0.15 : 0.45 }}
      />
    </motion.svg>
  );
}

function Leaf({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 90" className={className} aria-hidden="true">
      <path
        d="M30 88C31 60 27 34 38 8M31 60C15 54 9 42 8 30c14 1 23 9 24 24M34 42c1-16 9-27 21-32 1 14-6 25-21 32M29 73C17 70 8 63 4 52c13-1 22 5 27 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EstimateHero({ booking, now, isComeCloser }: { booking: Booking; now: number; isComeCloser: boolean }) {
  const low = booking.start_low ? minutesUntil(booking.start_low, now) : 0;
  const high = booking.start_high ? minutesUntil(booking.start_high, now) : 0;
  const middle = (low + high) / 2;
  const reduce = useReducedMotion();
  const [breathe, setBreathe] = useState(true);
  return (
    <motion.div
      onPointerDown={() => setBreathe(false)}
      animate={
        isComeCloser && breathe && !reduce
          ? {
              boxShadow: [
                "0 0 0 0 color-mix(in oklab, var(--gold) 0%, transparent)",
                "0 0 0 10px color-mix(in oklab, var(--gold) 16%, transparent)",
                "0 0 0 0 color-mix(in oklab, var(--gold) 0%, transparent)",
              ],
            }
          : { boxShadow: "0 0 0 0 transparent" }
      }
      transition={{ duration: 2 }}
      className="mt-4 text-center"
    >
      <RollingEstimate value={middle} />
      <p className="mt-2 font-display text-[30px] font-medium">until her chair</p>
      <p className="mt-5 tabular-nums text-[17px]">{formatMinuteRange(low, high)}</p>
      {booking.start_low && booking.start_high && (
        <p className="mt-1 tabular-nums text-[15px] text-muted-foreground">
          {formatClockRange(booking.start_low, booking.start_high)}
        </p>
      )}
      <p className="mt-5 border-t border-gold/40 pt-4 text-[13px] leading-5 text-muted-foreground">
        This time is an estimate and moves as our braiders work.
      </p>
    </motion.div>
  );
}

function RollingEstimate({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { duration: 600, bounce: 0 });
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    motionValue.set(value);
    return spring.on("change", setShown);
  }, [motionValue, reduce, spring, value]);
  return <p className="font-display tabular-nums text-[44px] font-medium leading-none">About {shortEstimate(shown)}</p>;
}

function Position({ position, child }: { position: number | null; child: string }) {
  if (!position) return null;
  const ahead = Math.max(0, position - 1);
  return (
    <div className="relative mt-6 text-center">
      <Leaf className="leaf-sway absolute -left-3 top-0 h-20 w-16 text-leaf/70" />
      <Leaf className="leaf-sway absolute -right-3 top-2 h-20 w-16 scale-x-[-1] text-leaf/70" />
      <p className="font-display text-[32px] font-medium">{child} is</p>
      <p className="font-display tabular-nums text-[124px] font-semibold leading-[0.82]">#{position}</p>
      <p className="mt-4 text-[14px] text-muted-foreground">
        {ordinal(position)} in today's line · {ahead} {ahead === 1 ? "girl" : "girls"} ahead
      </p>
    </div>
  );
}

function Timeline({ status, isComeCloser }: { status: Booking["status"]; isComeCloser: boolean }) {
  const steps = ["Booked", "Come closer", "Her turn", "In the chair", "Ready"];
  const active = status === "ready" ? 4 : status === "in_chair" ? 3 : status === "called" ? 2 : isComeCloser ? 1 : 0;
  return (
    <ol className="relative mt-8 grid grid-cols-5 gap-1" aria-label="Booking progress">
      <span className="absolute left-[10%] right-[10%] top-[5px] h-px bg-border" aria-hidden="true" />
      <motion.span
        className="absolute left-[10%] top-[5px] h-px bg-foreground"
        initial={false}
        animate={{ width: `${active * 20}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden="true"
      />
      <motion.span
        className="absolute top-0 z-20 size-3 -translate-x-1/2 rounded-full bg-gold ring-4 ring-gold/15"
        initial={false}
        animate={{ left: `${10 + active * 20}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden="true"
      />
      {steps.map((step, index) => (
        <li key={step} className="relative min-w-0 text-center">
          <span
            className={cn(
              "relative z-10 mx-auto block size-3 rounded-full border-2 border-background",
              index < active ? "bg-foreground" : "bg-border",
            )}
          />
          <span
            className={cn(
              "mt-2 block text-[11px] leading-4",
              index === active ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

function RiskCard({ booking }: { booking: Booking }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {booking.finish_today_confirmed ? (
        <motion.div
          key="staying"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="mt-6 rounded-2xl bg-ready/10 p-5 text-[15px] leading-6 text-ready"
        >
          <strong>
            Zama has confirmed she'll finish {booking.child_name}'s hair today, even if it's after closing.
          </strong>
        </motion.div>
      ) : booking.at_risk ? (
        <motion.div
          key="risk"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="mt-6 rounded-2xl bg-tobacco/10 p-5 text-[15px] leading-6 text-tobacco"
        >
          <strong>Running later than planned.</strong>{" "}
          {booking.after_closing
            ? `Her hair may now finish after our ${formatClock(booking.closes_at)} closing.`
            : `Her finish is now close to our ${formatClock(booking.closes_at)} closing.`}{" "}
          Zama will contact you to agree what's best. Her place is still held.
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function AlertSetup({ message, onRequest }: { message: string | undefined; onRequest: () => Promise<void> }) {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-shell p-4">
      <div className="flex gap-3">
        <Bell className="mt-1 size-5 shrink-0 text-sage" aria-hidden="true" />
        <div>
          <p className="font-bold">Get alerts on this phone</p>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            We'll alert you when to come closer and when her hair is nearly done.
          </p>
        </div>
      </div>
      <Button variant="outline" className="mt-4 w-full" onClick={() => void onRequest()}>
        Get alerts on this phone
      </Button>
      {message && (
        <p className="mt-3 text-[13px] text-sage" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function BookingDetails({ booking, total, price }: { booking: Booking; total: number; price: number }) {
  return (
    <section className="mt-6 rounded-2xl bg-shell p-5">
      <h2 className="text-[17px] font-bold">Her booking</h2>
      <dl className="mt-3 grid gap-3 text-[15px]">
        <Detail label="Style" value={booking.style} />
        <Detail label="Wash and detangle" value={booking.needs_wash ? "Yes" : "No"} />
        <Detail label="Mani-pedi" value={booking.mani_pedi ? "Yes, in natural colours" : "No"} />
        <Detail
          label="While she waits"
          value={booking.waiting_pref ? WAITING_PREFS[booking.waiting_pref] : "No preference"}
        />
        <Detail label="Total" value={`${formatDuration(total)} · R${price}`} />
        <Detail label="Booked" value={`${formatClock(booking.booked_at)} · with Zama's Braids`} />
      </dl>
    </section>
  );
}

function CollectedGallery() {
  const images = [
    {
      src: completedAsset.url,
      width: 922,
      height: 768,
      alt: "A smiling braider and a girl admiring her finished beaded braids",
    },
    { src: braidingAsset.url, width: 922, height: 768, alt: "A braider carefully working on neat cornrows" },
    { src: salonAsset.url, width: 922, height: 768, alt: "The salon floor beside its glass-walled playroom" },
  ];
  return (
    <section className="mb-6">
      <h2 className="font-display text-[32px] leading-tight">Look how beautiful her braids came out.</h2>
      <p className="mt-2 text-[13px] leading-5 text-stone">
        A look at our salon and work. These are gallery photos, not this child's private booking photo. The playroom has
        a dedicated adult helper watching the children.
      </p>
      <div className="scrollbar-hidden mt-4 flex gap-3 overflow-x-auto pb-3">
        {images.map((image) => (
          <img
            key={image.src}
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            loading="lazy"
            decoding="async"
            className="aspect-square w-[72%] shrink-0 rounded-2xl object-cover"
          />
        ))}
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-right font-semibold">{value}</dd>
    </div>
  );
}

function SafetyCard({ booking }: { booking: Booking }) {
  return (
    <section
      className={cn(
        "mt-6 flex items-center gap-4 rounded-2xl border border-border p-4 text-[15px] leading-6",
        booking.checked_in ? "bg-ready/10 text-ready" : "bg-shell",
      )}
    >
      <img
        src={playroomAsset.url}
        alt="Children playing with wooden blocks in the glass-walled salon playroom"
        className="size-16 shrink-0 rounded-xl object-cover object-[50%_40%]"
      />
      <span>
        {booking.checked_in ? (
          <strong>{booking.child_name} is with us, in the playroom with our dedicated adult helper.</strong>
        ) : (
          "Our playroom is behind a glass door, with a dedicated adult helper watching the children the whole time. You and our team can always see her."
        )}
      </span>
    </section>
  );
}

function BookingMeaning({ booking, grace, stayClose }: { booking: Booking; grace: number; stayClose: number }) {
  return (
    <Collapsible className="mt-6 rounded-2xl border border-border">
      <CollapsibleTrigger className="flex min-h-14 w-full items-center justify-between gap-4 p-4 text-left text-[15px] font-bold">
        What your booking means <ChevronDown className="size-5" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-5 text-[15px] leading-6 text-muted-foreground">
        Your place in today's line is confirmed. We only take bookings we expect to finish before closing. We'll finish{" "}
        {booking.child_name}'s hair today as long as you're here within {grace} minutes of our call. Please stay close
        to the mall when this page says her chair is about {stayClose} minutes away. If the day runs long, we'll tell
        you here and Zama will contact you. We never cancel a booking without talking to you.
      </CollapsibleContent>
    </Collapsible>
  );
}

function AlertBanner({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "relative z-20 border-b px-5 py-4 text-primary-foreground",
        notice.moment === "come-closer" ? "border-primary/20 bg-primary" : "border-ready/20 bg-ready",
      )}
      role="alert"
    >
      <div className="mx-auto flex max-w-xl items-start gap-3">
        <motion.span
          animate={notice.moment === "come-closer" ? { rotate: [0, 14, -12, 8, -4, 0] } : { rotate: 0 }}
          transition={{ duration: 0.6 }}
        >
          <BellRing className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden="true" />
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{notice.moment === "come-closer" ? "Time to head over." : notice.title}</p>
          <p className="mt-0.5 text-[13px]">{notice.message}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-my-2 shrink-0 text-primary-foreground hover:bg-primary-foreground/10"
          aria-label="Close alert"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
    </motion.div>
  );
}

function ProgressRing({ value, total }: { value: number; total: number }) {
  const progress = Math.max(0, Math.min(1, 1 - value / Math.max(1, total)));
  return (
    <div className="relative grid size-20 shrink-0 place-items-center">
      <svg viewBox="0 0 80 80" className="absolute inset-0 size-full -rotate-90">
        <circle cx="40" cy="40" r="34" fill="none" stroke="var(--muted)" strokeWidth="6" />
        <motion.circle
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke="var(--gold)"
          strokeWidth="6"
          strokeLinecap="round"
          pathLength="1"
          initial={false}
          animate={{ pathLength: progress }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </svg>
      <span className="relative z-10 font-sans tabular-nums text-[14px] font-bold leading-none">
        {Math.round(progress * 100)}%
      </span>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => Promise<void> }) {
  return (
    <Shell>
      <p className="text-clay">We couldn't open this booking right now.</p>
      <Button variant="ghost" onClick={() => void onRetry()}>
        Try again
      </Button>
    </Shell>
  );
}

function NotFound() {
  return (
    <Shell>
      <h1 className="font-display text-[32px]">We couldn't find that booking</h1>
      <Button asChild size="lg" className="mt-6 w-full">
        <Link to="/find">Find my booking</Link>
      </Button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background">
      <CrownedHeader />
      <section className="mx-auto max-w-xl px-5 pb-16 pt-8 sm:px-8">{children}</section>
    </main>
  );
}

function midpoint(low: string | null, high: string | null) {
  if (!low || !high) return null;
  return new Date((new Date(low).getTime() + new Date(high).getTime()) / 2).toISOString();
}

function shortEstimate(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes / 5) * 5);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return `${hours} hr${rest ? ` ${rest}` : ""}`;
}

function readStringList(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function playChime() {
  try {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.36);
  } catch {
    /* Audio is optional. */
  }
}

function canCancel(status: Booking["status"]) {
  return status === "booked" || status === "called";
}

function isTerminal(status: Booking["status"]) {
  return status === "collected" || status === "cancelled" || status === "no_show" || status === "moved_other_day";
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
