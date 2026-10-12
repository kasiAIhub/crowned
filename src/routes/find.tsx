import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { CrownedHeader } from "@/components/crowned-header";
import { Button } from "@/components/ui/button";
import { findBooking, formatPhone, getSavedBookings, saveBooking, type SavedBooking } from "@/lib/api";

export const Route = createFileRoute("/find")({
  head: () => ({
    meta: [
      { title: "Find a booking — Crowned" },
      { name: "description", content: "Reopen a Crowned booking and follow her live chair estimate." },
      { property: "og:title", content: "Find a booking — Crowned" },
      { property: "og:description", content: "Reopen a Crowned booking and follow her live chair estimate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FindPage,
});

const inputCls =
  "quiet-field mt-2 block min-h-14 w-full px-4 text-[16px]";

function FindPage() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState<SavedBooking[]>([]);
  const [phone, setPhone] = useState("");
  const [child, setChild] = useState("");
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => setSaved(getSavedBookings()), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(undefined);
    if (!/^0\d{9}$/.test(phone)) return setMsg("Please enter a 10-digit number starting with 0.");
    if (!child.trim()) return setMsg("Please tell us her first name.");
    setBusy(true);
    try {
      const code = await findBooking(phone, child.trim());
      if (!code) {
        setMsg("We couldn't find a booking for that number and name. Check the spelling, or book a place.");
        return;
      }
      saveBooking({ code, child: child.trim() });
      void navigate({ to: "/b/$code", params: { code }, search: { new: undefined } });
    } catch {
      setMsg("We couldn't search right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-[100svh] flex-col bg-background">
      <CrownedHeader />
      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5 sm:px-8">
        <p className="mb-3 text-[13px] font-bold uppercase text-deep-gold">Hello, how are you?</p>
        <h1 className="font-display text-[32px] leading-[1.12]">Find her booking</h1>

        {saved.length > 0 && (
          <div className="mt-6 grid gap-3">
            <p className="text-[15px] text-muted-foreground">Bookings on this phone</p>
            {saved.map((b) => (
              <Link
                key={b.code}
                to="/b/$code"
                params={{ code: b.code }}
                search={{ new: undefined }}
                className="flex min-h-16 items-center justify-between rounded-2xl bg-shell p-4 text-[17px] font-bold"
              >
                <span>
                  {b.child} · <span className="tabular-nums tracking-wider">{b.code}</span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
            <p className="mt-4 text-[15px] text-muted-foreground">Looking for a different booking?</p>
          </div>
        )}

        <form className="mt-6 grid gap-5" onSubmit={submit}>
          <label className="block">
            <span className="label">Your phone number</span>
            <input
              className={`${inputCls} tabular-nums`}
              inputMode="numeric"
              autoComplete="tel"
              placeholder="072 123 4567"
              value={formatPhone(phone)}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </label>
          <label className="block">
            <span className="label">Her first name</span>
            <input className={inputCls} maxLength={40} value={child} onChange={(e) => setChild(e.target.value)} />
          </label>
          {msg && (
            <p className="text-[15px] font-semibold text-clay" role="alert">
              {msg}{" "}
              {msg.includes("book a place") && <Link to="/book" className="underline">Book a place</Link>}
            </p>
          )}
          <Button size="lg" className="w-full" type="submit" disabled={busy}>
            {busy ? "Looking…" : "Find my booking"}
          </Button>
          <p className="mt-auto pt-8 text-[13px] leading-5 text-muted-foreground">
            Demo note: anyone who knows your number and her first name can open this booking. The full version will send you a one-time code.
          </p>
        </form>
      </section>
    </main>
  );
}
