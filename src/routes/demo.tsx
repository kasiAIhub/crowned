import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Monitor, UserRound, UsersRound } from "lucide-react";

import { CrownedHeader } from "@/components/crowned-header";
import { DemoControls } from "@/components/demo-controls";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import { getSalonList } from "@/lib/salon";
import { PRACTICE_FRAME, PRACTICE_PIN } from "@/lib/practice";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Crowned salon demo" },
      { name: "description", content: "Follow a family booking and Zama's live salon floor side by side." },
      { property: "og:title", content: "Crowned salon demo" },
      { property: "og:description", content: "Follow a family booking and Zama's live salon floor side by side." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DemoPage,
});

function DemoPage() {
  const fetcher = useCallback(() => getSalonList(PRACTICE_PIN), []);
  const { data, refresh } = useLive(fetcher);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState<"parent" | "salon">("parent");
  const [ready, setReady] = useState(false);
  const newestSeen = useRef("");
  const active = useMemo(
    () =>
      data?.bookings.filter((b) => !["collected", "cancelled", "no_show", "moved_other_day"].includes(b.status)) ?? [],
    [data],
  );

  const [booking, setBooking] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  useEffect(() => {
    if (!active.length) return;
    const newest =
      [...active].sort((a, b) => new Date(a.booked_at).getTime() - new Date(b.booked_at).getTime()).at(-1)?.code ?? "";
    if (
      !selected ||
      !active.some((b) => b.code === selected) ||
      (newestSeen.current && newestSeen.current !== newest)
    ) {
      setSelected(newest);
      setBooking(false);
    }
    newestSeen.current = newest;
  }, [active, selected]);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between pr-5">
        <CrownedHeader />
        <span className="hidden items-center gap-2 text-[13px] font-bold text-sage sm:flex">
          <Monitor className="size-4" />
          Salon demo
        </span>
      </div>
      <div className="mx-auto max-w-[1500px] px-4 pb-24 sm:px-6">
        <div className="sticky top-0 z-30 mb-4 grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-y border-border bg-background/95 py-2 backdrop-blur lg:grid-cols-[minmax(240px,360px)_1fr_auto]">
          <label className="grid min-w-0 gap-1 text-[13px] font-bold">
            Follow a booking
            <select
              className="quiet-field h-12 min-w-0 w-full px-3 text-[15px]"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {active.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.child_name} · {b.code}
                </option>
              ))}
            </select>
          </label>
          <div className="col-span-2 grid grid-cols-2 gap-2 lg:col-span-1 lg:col-start-2">
            <Button variant={tab === "parent" ? "default" : "outline"} onClick={() => setTab("parent")}>
              <UserRound />
              Parent
            </Button>
            <Button variant={tab === "salon" ? "default" : "outline"} onClick={() => setTab("salon")}>
              <UsersRound />
              Zama's floor
            </Button>
          </div>
          <DemoControls pin={PRACTICE_PIN} onChanged={refresh} compact />
        </div>
        <p
          role="note"
          className="mb-3 rounded-[14px] border border-[color:var(--tobacco,#8F6417)] bg-card px-4 py-3 text-[14px] font-semibold leading-5 text-ink"
        >
          Practice data only. Please don't enter real names or phone numbers — everything typed here is shared with
          other demo visitors.
        </p>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] leading-5 text-stone">
            The parent sees only the selected family. Zama sees the live floor. Both sides update from the same salon
            plan. Everything here is a practice salon with made-up families.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBooking(true);
              setTab("parent");
            }}
          >
            Book a practice family
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={tab === "parent" ? "block" : "hidden lg:block"} aria-label="Parent live booking">
            {booking ? (
              <AutoHeightFrame key="book" title="Book a practice family" src="/book" />
            ) : selected ? (
              <AutoHeightFrame key={selected} title="Parent live booking" src={`/b/${selected}`} />
            ) : (
              <p className="p-5 text-stone">No active sample booking yet.</p>
            )}
          </section>
          <section className={tab === "salon" ? "block" : "hidden lg:block"} aria-label="Zama's salon floor">
            {ready ? <AutoHeightFrame title="Zama's salon floor" src="/salon" active={tab === "salon"} /> : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function AutoHeightFrame({ title, src, active = true }: { title: string; active?: boolean; src: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(900);
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const measure = () => {
    cleanup.current?.();
    const doc = ref.current?.contentDocument;
    if (!doc) return;
    const update = () => setHeight(Math.max(720, doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(doc.documentElement);

    if (doc.body) observer.observe(doc.body);

    cleanup.current = () => observer.disconnect();
  };
  useEffect(() => () => cleanup.current?.(), []);

  useEffect(() => {
    if (!active) return;

    const frame = requestAnimationFrame(measure);

    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <iframe
      ref={ref}
      name={PRACTICE_FRAME}
      title={title}
      src={src}
      scrolling="no"
      onLoad={measure}
      style={{ height }}
      className="w-full border-0 bg-background"
    />
  );
}
