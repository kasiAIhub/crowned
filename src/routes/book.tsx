import { useCallback, useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ArrowLeft, Check, Cookie, Gamepad2, Minus, Plus, Tv } from "lucide-react";

import { CrownedHeader } from "@/components/crowned-header";
import { StickyActionBar } from "@/components/sticky-action-bar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useLive } from "@/hooks/use-live";
import { useNow } from "@/hooks/use-now";
import {
  WASH_PRICE_RANDS,
  bookPlace,
  recordWhatsAppConsent,
  formatDuration,
  formatMinuteRange,
  formatMinutes,
  formatPhone,
  getOptions,
  getPublicSettings,
  getServices,
  minutesUntil,
  saveBooking,
  type BookingOption,
  type PublicSettings,
  type Service,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import styleAsset from "@/assets/4-image-05f787a1.jpg.asset.json";
import playroomAsset from "@/assets/2-image-6b1f07bb.jpg.asset.json";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book her place — Crowned" },
      { name: "description", content: "Choose a style and book her confirmed place in today's live line." },
      { property: "og:title", content: "Book her place — Crowned" },
      { property: "og:description", content: "Choose a style and book her confirmed place in today's live line." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <MotionConfig reducedMotion="user"><BookPage /></MotionConfig>,
});

type Data = { services: Service[]; options: BookingOption[]; settings: PublicSettings };
type Pref = "show" | "game" | "snack" | "";

const PREFS: { id: Pref; label: string; Icon: typeof Tv }[] = [
  { id: "show", label: "Watch a show", Icon: Tv },
  { id: "game", label: "Play a game", Icon: Gamepad2 },
  { id: "snack", label: "Have a snack", Icon: Cookie },
];

const nameOk = (s: string) => s.trim().length >= 1 && s.trim().length <= 40;

function BookPage() {
  const navigate = useNavigate();
  const now = useNow();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [serviceId, setServiceId] = useState<string>();
  const [wash, setWash] = useState(false);
  const [parent, setParent] = useState("");
  const [phone, setPhone] = useState("");
  const [child, setChild] = useState("");
  const [age, setAge] = useState(7);
  const [note, setNote] = useState("");
  const [pref, setPref] = useState<Pref>("");
  const [maniPedi, setManiPedi] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [waConsent, setWaConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<string>();

  const fetcher = useCallback(async (): Promise<Data> => {
    const [services, options, settings] = await Promise.all([getServices(), getOptions(wash), getPublicSettings()]);
    return { services, options, settings };
  }, [wash]);
  const { data, loading, error, refresh } = useLive(fetcher);

  const service = data?.services.find((s) => s.id === serviceId);
  const optionFor = (id?: string) => data?.options.find((o) => o.service_id === id);
  const option = optionFor(serviceId);
  const prep = data?.settings.prep_minutes ?? 40;
  const grace = data?.settings.grace_minutes ?? 15;
  const comeCloser = data?.settings.come_closer_minutes ?? 30;
  const openTime = data?.settings.default_open_time ?? "08:00";
  const totalMin = service ? service.braid_minutes + (wash ? prep : 0) : 0;
  const totalPrice = service ? service.price_rands + (wash ? WASH_PRICE_RANDS : 0) : 0;
  const anyFits = data ? data.options.some((o) => o.fits) : true;
  const chosenFull = !!option && !option.fits;

  const wait = useMemo(() => {
    const o = option?.fits ? option : data?.options.find((x) => x.fits);
    if (!o) return undefined;
    const low = minutesUntil(o.start_low, now);
    const high = minutesUntil(o.start_high, now);
    return { about: (low + high) / 2, low, high };
  }, [option, data, now]);

  const phoneDigits = phone.replace(/\D/g, "");
  const errors = {
    parent: nameOk(parent) ? "" : "Please tell us your name.",
    phone: /^0\d{9}$/.test(phoneDigits) ? "" : "Please enter a 10-digit number starting with 0.",
    child: nameOk(child) ? "" : "Please tell us her first name.",
    note: note.length <= 120 ? "" : "Please keep the note to 120 characters.",
  };
  const step2Ok = !Object.values(errors).some(Boolean);

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setStep(to);
    setRefusal(undefined);
    window.scrollTo({ top: 0 });
  };

  const next = () => {
    if (step === 1 && !step2Ok) return setTouched(true);
    go(step + 1);
  };

  const book = async () => {
    if (!service) return;
    navigator.vibrate?.(8);
    setSubmitting(true);
    setRefusal(undefined);
    try {
      const res = await bookPlace({
        parent_name: parent.trim(),
        phone: phoneDigits,
        child_name: child.trim(),
        child_age: age,
        service_id: service.id,
        needs_wash: wash,
        mani_pedi: maniPedi,
        waiting_pref: pref || undefined,
        note: note.trim() || undefined,
      });
      if (res.code) {
        saveBooking({ code: res.code, child: child.trim() });
        if (waConsent && /^0[678]\d{8}$/.test(phoneDigits)) await recordWhatsAppConsent(res.code, phoneDigits);
        void navigate({ to: "/b/$code", params: { code: res.code }, search: { new: 1 } });
        return;
      }
      setRefusal(res.message ?? "We couldn't book right now. Please try again.");
      void refresh();
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : "We couldn't book right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const primary = (() => {
    if (step === 0) return { label: "Continue", disabled: !service || chosenFull, onClick: next };
    if (step === 1) return { label: "Continue", disabled: false, onClick: next };
    if (step === 2) return { label: pref || !maniPedi ? "Continue" : "Skip for now", disabled: false, onClick: next };
    return { label: submitting ? "Booking…" : "Book her place", disabled: !agreed || submitting || chosenFull, onClick: book };
  })();

  const titles = ["Choose her style", "About you and her", "While she waits", "Review and book"];

  return (
    <main className="flex min-h-[100svh] flex-col bg-background">
      <CrownedHeader />
      <div className="mx-auto w-full max-w-xl flex-1 px-5 pb-[calc(104px+env(safe-area-inset-bottom))] sm:px-8">
        <div className="flex min-h-12 items-center justify-between gap-4">
          {step > 0 ? (
            <Button variant="ghost" size="sm" className="-ml-3 min-h-12" onClick={() => go(step - 1)}>
              <ArrowLeft aria-hidden="true" /> Back
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm" className="-ml-3 min-h-12">
              <Link to="/"><ArrowLeft aria-hidden="true" /> Back</Link>
            </Button>
          )}
          <div className="flex items-center gap-3"><div className="flex w-20 gap-1.5" aria-hidden="true">{[0, 1, 2, 3].map((i) => <motion.span layout key={i} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-foreground" : "bg-border")} />)}</div><span className="tabular-nums text-[13px] font-bold text-muted-foreground">{step + 1} of 4</span></div>
        </div>

        {!anyFits && data ? (
          <FullyBooked openTime={openTime} />
        ) : (
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.section
              key={step}
              custom={dir}
              initial={{ x: dir * 32, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: dir * -32, opacity: 0 }}
              transition={{ duration: dir > 0 ? 0.32 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="pt-7"
            >
              <h1 className="font-display text-[32px] leading-[1.12]">{titles[step]}</h1>

              {step === 0 && (
                <div className="mt-6">
                  {loading && !data ? (
                    <p className="text-[15px] text-muted-foreground">Checking today's styles…</p>
                  ) : error && !data ? (
                    <div className="flex items-center gap-3">
                      <p className="text-[15px] text-clay">We couldn't load the styles.</p>
                      <Button variant="ghost" size="sm" onClick={() => void refresh()}>Try again</Button>
                    </div>
                  ) : (
                    <div className="grid gap-2" role="radiogroup" aria-label="Her style">
                      {data?.services.map((s) => {
                        const fits = optionFor(s.id)?.fits !== false;
                        const selected = s.id === serviceId;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={!fits}
                            onClick={() => setServiceId(s.id)}
                            className={cn(
                              "min-h-[72px] rounded-[14px] border bg-shell p-2 text-left transition-colors",
                              selected ? "border-gold" : "border-transparent",
                              !fits && "opacity-55",
                            )}
                          >
                            <div className="grid min-h-14 grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3">
                              <img src={styleAsset.url} alt="A braider carefully working on neat cornrows" className="size-14 shrink-0 rounded-lg object-cover object-[70%_40%]" />
                              <div className="min-w-0">
                                <span className="block text-[16px] font-bold leading-5">{s.name}</span>
                                <span className="tabular-nums mt-0.5 block text-[14px] leading-5 text-muted-foreground">{formatDuration(s.braid_minutes)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="tabular-nums text-[16px] font-bold">R{s.price_rands}</span>
                                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border border-primary/30", selected && "border-primary bg-primary")}><span className="size-1.5 rounded-full bg-primary-foreground" /></span>
                              </div>
                            </div>
                            {!fits && <p className="mt-1 text-right text-[14px] font-bold text-amber">Full for today</p>}
                            {s.is_special && (
                              <p className="mt-2 border-t border-border pt-2 text-[14px] leading-5 text-muted-foreground">
                                Thin or long braids take 2.5 hours or more. We'll confirm the details with you.
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <label className="mt-5 flex min-h-14 items-center justify-between gap-4 rounded-2xl bg-shell p-4">
                    <span className="text-[15px] font-semibold">
                      She needs a wash and detangle (+{prep} min, +R{WASH_PRICE_RANDS})
                    </span>
                    <Switch checked={wash} onCheckedChange={setWash} />
                  </label>
                  <p className="mt-4 text-[15px] leading-6 text-muted-foreground">
                    Free mani-pedi in natural colours while she's braided. It keeps little hands busy.
                  </p>
                </div>
              )}

              {step === 1 && (
                <div className="mt-6 grid gap-5">
                  <Field label="Your name" error={touched ? errors.parent : ""}>
                    <input className={inputCls} value={parent} maxLength={40} autoComplete="name" onChange={(e) => setParent(e.target.value)} />
                  </Field>
                  <Field label="Your phone number" error={touched ? errors.phone : ""}>
                    <input
                      className={cn(inputCls, "tabular-nums")}
                      value={formatPhone(phone)}
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="072 123 4567"
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    />
                    <span className="mt-2 block text-[13px] text-muted-foreground">We use your number to find your booking again. No marketing.</span>
                    <label className="mt-3 hidden gap-3 text-[14px] leading-5">
                      <input type="checkbox" className="mt-0.5 size-6 shrink-0 accent-foreground" checked={waConsent} onChange={(e) => setWaConsent(e.target.checked)} />
                      <span>Yes, send me WhatsApp messages about my place in the queue. I can opt out any time.</span>
                    </label>
                    {waConsent && phoneDigits.length === 10 && !/^0[678]/.test(phoneDigits) ? (
                      <span className="mt-1 block text-[13px] font-semibold text-destructive">WhatsApp needs a cellphone number starting with 06, 07 or 08.</span>
                    ) : null}
                  </Field>
                   <div className="grid grid-cols-[minmax(0,1fr)_124px] items-start gap-3"><Field label="Her first name" error={touched ? errors.child : ""}>
                    <input className={inputCls} value={child} maxLength={40} onChange={(e) => setChild(e.target.value)} />
                  </Field>
                   <div className="min-w-0">
                     <span className="label block">Her age</span>
                     <div className="mt-2 grid h-14 grid-cols-[44px_minmax(0,1fr)_44px] items-center rounded-[10px] border border-input bg-shell px-1">
                       <Button variant="ghost" className="h-11 w-11 p-0" aria-label="Younger" disabled={age <= 3} onClick={() => setAge(age - 1)}>
                        <Minus />
                      </Button>
                       <span className="tabular-nums text-center font-display text-[30px] leading-none" aria-live="polite">{age}</span>
                       <Button variant="ghost" className="h-11 w-11 p-0" aria-label="Older" disabled={age >= 14} onClick={() => setAge(age + 1)}>
                        <Plus />
                      </Button>
                    </div>
                  </div></div>
                  <Field label="Note for the braider (optional)" error={errors.note}>
                    <textarea
                      className={cn(inputCls, "min-h-24 py-3")}
                      value={note}
                      maxLength={120}
                      placeholder="Tender-headed, first time braiding…"
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <span className="tabular-nums mt-1 block text-right text-[13px] text-muted-foreground">{note.length}/120</span>
                  </Field>
                </div>
              )}

              {step === 2 && (
                <div className="mt-6">
                  <div className="grid grid-cols-3 gap-3">
                    {PREFS.map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={pref === id}
                        onClick={() => setPref(pref === id ? "" : id)}
                        className={cn(
                          "flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-shell p-3 text-[15px] font-bold",
                          pref === id ? "border-gold" : "border-transparent",
                        )}
                      >
                        <Icon className="size-7 text-deep-gold" aria-hidden="true" />
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="mt-4 flex min-h-14 items-center justify-between gap-4 rounded-2xl bg-shell p-4">
                    <span className="text-[15px] font-semibold">Mani-pedi while braiding</span>
                    <Switch checked={maniPedi} onCheckedChange={setManiPedi} />
                  </label>
                  <img src={playroomAsset.url} alt="Children playing in the salon playroom" className="mt-5 aspect-[4/3] w-full rounded-[18px] object-cover object-center" />
                  <p className="mt-5 text-[15px] leading-6 text-muted-foreground">
                    Our playroom is behind a glass door, with a dedicated adult helper watching the children the whole time. You and our team can always see her.
                  </p>
                </div>
              )}

              {step === 3 && service && (
                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl bg-shell p-4 text-[15px]">
                    <ReviewRow label="Style" value={`${service.name}${wash ? " + wash" : ""}`} onEdit={() => go(0)} />
                    <ReviewRow label="You" value={`${parent.trim()} · ${formatPhone(phoneDigits)}`} onEdit={() => go(1)} />
                    <ReviewRow label="Her" value={`${child.trim()}, ${age}${note.trim() ? ` · "${note.trim()}"` : ""}`} onEdit={() => go(1)} />
                    <ReviewRow
                      label="While she waits"
                      value={[PREFS.find((p) => p.id === pref)?.label, maniPedi ? "Mani-pedi" : "No mani-pedi"].filter(Boolean).join(" · ")}
                      onEdit={() => go(2)}
                    />
                    <div className="mt-4 border-t border-border pt-4 leading-6">
                    <p>
                      Your booking is confirmed as soon as you tap Book: a place in today's line, with her chair tracked live. We only take bookings we expect to finish before closing. We don't give a fixed time, because braids vary
                      {wait ? (
                        <>; right now her chair is <span className="tabular-nums font-bold">{formatMinutes(wait.about)}</span> away (<span className="tabular-nums">{formatMinuteRange(wait.low, wait.high).replace("usually ", "usually ")}</span>).</>
                      ) : "."}
                    </p>
                    <p className="mt-3 tabular-nums font-bold">{formatDuration(totalMin)} · R{totalPrice}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-shell p-4 text-[15px] leading-6 text-muted-foreground">
                    <p className="mb-2 text-[13px] font-bold uppercase text-deep-gold">Our time promise</p>
                    It'll take {formatDuration(totalMin)} to do her hair. We keep time because we're giving your Saturday back to you. We'll alert you {comeCloser} minutes before her chair is ready, so please stay close to the mall. We hold her place for {grace} minutes after we call; after that we have to move to the next child. It's only fair to the family behind you. If the day runs long, we'll tell you here and Zama will contact you to agree what's best. We never cancel a booking without talking to you.
                  </div>
                  <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-shell p-4 text-[15px] font-bold">
                    <input type="checkbox" className="size-6 accent-foreground" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                    I understand and agree
                  </label>
                </div>
              )}
            </motion.section>
          </AnimatePresence>
        )}
      </div>

      {(anyFits || !data) && (
        <StickyActionBar keyboardAware>
          <div className="mx-auto flex min-h-[72px] w-full max-w-xl items-center gap-3 px-5 sm:px-8">
            <div aria-live="polite" className="min-w-0 flex-1 text-[14px]">
              {service ? (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-bold">{service.name}{wash ? " + wash" : ""}</span>
                  <span className="tabular-nums shrink-0 font-bold">R{totalPrice}</span>
                </div>
              ) : (
                <p className="font-bold">Choose a style to see her time and price</p>
              )}
               <div className="truncate text-muted-foreground">
                  <motion.span key={totalMin} initial={{ opacity: 0.5, y: 3 }} animate={{ opacity: 1, y: 0 }} className="tabular-nums">{service ? `Total time: ${formatDuration(totalMin)}` : ""}</motion.span>
                {chosenFull ? (
                  <span className="font-bold text-amber">Full for today</span>
                ) : wait ? (
                   <span className="tabular-nums text-sage font-bold"> · Her chair: {formatMinutes(wait.about)} away</span>
                ) : null}
              </div>
              {chosenFull && (
                <p className="mt-1 text-[13px] text-amber">
                  This style no longer fits today. Still available:{" "}
                  {data?.services.filter((s) => optionFor(s.id)?.fits).map((s) => s.name).join(", ")}.
                </p>
              )}
              {refusal && <p className="mt-2 text-[15px] font-semibold text-clay" role="alert">{refusal}</p>}
              {step === 3 && !agreed && !refusal && <p className="mt-1 text-[13px] font-semibold text-deep-gold">Tick "I understand and agree" above to book.</p>}
            </div>
            
            <Button size="lg" className="shrink-0 px-5" disabled={primary.disabled} onClick={() => void primary.onClick()}>
              {primary.label}
            </Button>
          </div>
        </StickyActionBar>
      )}
    </main>
  );
}

const inputCls =
  "mt-2 block min-h-14 w-full rounded-[10px] border border-input bg-shell px-4 text-[16px] outline-none focus:border-gold focus:ring-[3px] focus:ring-gold/20";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label block">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[13px] font-semibold text-clay">{error}</span> : null}
    </label>
  );
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className="break-words font-semibold">{value}</p>
      </div>
      <Button variant="ghost" size="sm" className="min-h-12 shrink-0 text-deep-gold" onClick={onEdit}>Edit</Button>
    </div>
  );
}

function FullyBooked({ openTime }: { openTime: string }) {
  return (
    <div className="pt-10">
      <h1 className="font-display text-[32px] leading-[1.12]">Sorry, we're full</h1>
      <p className="mt-4 rounded-2xl bg-shell p-5 text-[17px] leading-7 text-amber">
        We're fully booked for today. Please book again tomorrow from {openTime}.
      </p>
      <Button asChild variant="ghost" size="lg" className="mt-4 w-full">
        <Link to="/"><Check aria-hidden="true" /> Back to the welcome page</Link>
      </Button>
    </div>
  );
}
