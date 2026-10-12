import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CircleCheck, Play } from "lucide-react";
import { motion } from "motion/react";

import heroAsset from "@/assets/1-image-3de81a38.jpg.asset.json";
import completedAsset from "@/assets/3-image-60e6a8c5.jpg.asset.json";
import braidingAsset from "@/assets/4-image-05f787a1.jpg.asset.json";
import playroomAsset from "@/assets/5-image-65e5dfaa.jpg.asset.json";
import salonAsset from "@/assets/6-image-019cd5c8.jpg.asset.json";
import beforeVideo from "@/assets/11-before-new.mp4.asset.json";
import afterVideo from "@/assets/12-with-new.mp4.asset.json";
import beforeVideoWebm from "@/assets/13-before-new.webm.asset.json";
import afterVideoWebm from "@/assets/14-with-new.webm.asset.json";
import beforePoster from "@/assets/15-before-poster.jpg.asset.json";
import afterPoster from "@/assets/16-with-poster.jpg.asset.json";
import { CrownedHeader } from "@/components/crowned-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Crowned — Zama's Braids live line" },
    { name: "description", content: "Book her confirmed place in today's live braiding line and know when to come." },
    { property: "og:title", content: "Crowned — Zama's Braids live line" },
    { property: "og:description", content: "Book her confirmed place in today's live braiding line and know when to come." },
    { property: "og:image", content: "https://id-preview--4451acc6-8d3b-43df-a77d-078d52c2ce9d.lovable.app/crowned-social.jpg" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: "https://id-preview--4451acc6-8d3b-43df-a77d-078d52c2ce9d.lovable.app/crowned-social.jpg" },
  ] }),
  component: WelcomePage,
});

const gallery = [
  { src: braidingAsset.url, position: "object-[70%_40%]", alt: "A braider carefully parting and braiding a smiling girl's cornrows", caption: "Careful hands, neat parts and time to do her braids beautifully." },
  { src: playroomAsset.url, position: "object-[50%_40%]", alt: "Children playing with wooden blocks in the glass-walled salon playroom", caption: "The children's playroom sits behind glass, with a dedicated adult helper watching them." },
  { src: salonAsset.url, position: "object-center", alt: "The salon floor with braiders at work and the children's playroom behind glass", caption: "A calm salon floor, with the playroom visible through glass." },
];

function WelcomePage() {
  return (
    <main className="min-h-screen bg-background">
      <CrownedHeader />
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-5 pb-8 pt-0 sm:px-8 lg:min-h-[calc(100svh-56px)] lg:grid-cols-[0.86fr_1.14fr] lg:items-start lg:gap-14 lg:pb-7 lg:pt-16">
        <motion.div className="lg:order-1">
          <p className="label mb-2 text-deep-gold">Zama's Braids</p>
          <h1 className="max-w-xl font-display text-[50px] font-medium leading-[0.96] lg:text-[68px] lg:leading-[0.94]">
            {["Go live", "your life."].map((line) => <span key={line} className="block">{line}</span>)}
            <span className="relative block w-fit italic text-deep-gold">We'll call you.<span className="absolute -bottom-1 left-0 h-0.5 w-[132px] bg-gold" /></span>
          </h1>
          <p className="mt-3 max-w-[260px] text-[15px] leading-[22px] text-muted-foreground lg:mt-5 lg:text-[16px] lg:leading-6">Braids for girls, done on time. Book her place from anywhere and we'll tell you when to come.</p>
          <figure className="hero-sweep relative -mx-5 mt-3 h-[195px] overflow-hidden sm:mx-0 sm:h-[310px] lg:absolute lg:inset-y-[92px] lg:left-[52%] lg:right-8 lg:mt-0 lg:h-auto lg:max-h-[720px]">
            <img src={heroAsset.url} alt="A laughing girl showing her fresh beaded braids while her mother smiles behind her" width="922" height="768" fetchPriority="high" decoding="async" className="h-full w-full object-cover object-[62%_30%] [mask-image:linear-gradient(to_bottom,transparent_0%,black_12%,black_100%)] lg:[mask-image:linear-gradient(to_bottom,transparent_0%,black_8%,black_100%)]" />
          </figure>
          <div className="relative z-10 lg:max-w-[440px]">
          <div className="mt-2 border-y border-border py-2">
            <p className="text-[15px] leading-6 text-muted-foreground">A calm chair, neat parts and braids done on time. Book her place in a minute and we'll call you when it's her turn.</p>
          </div>
          <div className="mt-2 rounded-[18px] border border-border bg-shell p-2">
              <Button asChild size="lg" className="w-full"><Link to="/demo">Book her place <ArrowRight /></Link></Button>
              <Button asChild variant="ghost" size="lg" className="mt-2 w-full text-muted-foreground"><Link to="/find">I've already booked</Link></Button>
            </div></div>
        </motion.div>
      </section>

      <section className="border-y border-border bg-shell py-8">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 sm:px-8 md:grid-cols-3">
          {["Book her place in a minute. It's confirmed straight away.", "Go for lunch. She's in the playroom with our dedicated adult helper.", "We call you back in time. Her braids are beautiful, and she doesn't want to leave."].map((text, i) => <div key={text} className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-sage/10 text-[13px] font-bold text-sage">{i + 1}</span><p className="text-[15px] font-semibold leading-6">{text}</p></div>)}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <p className="text-[13px] font-bold uppercase text-deep-gold">The difference</p>
        <h2 className="mt-2 font-display text-[32px]">Less chasing. More braiding.</h2>
        <div className="mt-6 grid items-stretch gap-8 md:grid-cols-2">
          <StoryVideo src={beforeVideo.url} fallbackSrc={beforeVideoWebm.url} poster={beforePoster.url} label="Before Crowned" copy="Parents needed answers, and Zama had to stop braiding to give them. The message overlays shown here tell that old story; Crowned does not send WhatsApp or SMS alerts." />
          <StoryVideo src={afterVideo.url} fallbackSrc={afterVideoWebm.url} poster={afterPoster.url} label="With Crowned" copy="The family follows one private live booking page. Alerts work on that open page, with optional browser notifications." />
        </div>
      </section>

      <section className="pb-[calc(24px+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-6xl px-5 sm:px-8"><p className="text-[13px] font-bold uppercase text-deep-gold">Our salon</p><h2 className="mt-2 font-display text-[32px]">A Saturday made calmer</h2></div>
        <div className="mx-auto mt-6 max-w-6xl"><p className="px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:px-8 lg:hidden">Swipe →</p><div className="scrollbar-hidden mt-2 flex gap-4 overflow-x-auto px-5 pb-4 pr-5 sm:px-8 lg:grid lg:grid-cols-3 lg:items-stretch lg:overflow-visible lg:px-8 lg:pr-8">
          {gallery.map((image) => <figure key={image.src} className="flex w-[calc(100vw-60px)] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-shell lg:w-auto lg:min-w-0"><img src={image.src} alt={image.alt} width="922" height="768" loading="lazy" decoding="async" className={`aspect-square w-full object-cover ${image.position}`} /><figcaption className="flex-1 p-4 text-[13px] leading-5 text-muted-foreground">{image.caption}</figcaption></figure>)}
        </div><div className="mt-1 flex justify-center gap-1.5 lg:hidden" aria-hidden="true">{gallery.map((image, index) => <span key={image.src} className={`size-1.5 rounded-full ${index === 0 ? "bg-gold" : "bg-border"}`} />)}</div></div>
        <div className="mx-auto mt-4 max-w-6xl px-5 sm:px-8">
        <div className="grid gap-5 border-t border-border pt-6 md:grid-cols-[1fr_auto] md:items-center">
          <p className="flex max-w-3xl items-start gap-3 text-[13px] leading-5 text-muted-foreground"><CircleCheck className="mt-0.5 size-5 shrink-0 text-sage" />Your booking is confirmed straight away, with a place in today's line. We don't give a fixed time, because braids vary. We track her chair live instead.</p>
          <div className="border border-border bg-shell p-4 text-[13px]"><p className="font-bold">Judges: try it</p><p className="mt-1 text-muted-foreground">Book an example family as a parent, then move the salon line. No PIN needed. Best on a laptop: <Link to="/demo" className="font-bold underline">try the booking flow</Link>.</p></div>
        </div></div>
      </section>
    </main>
  );
}

function StoryVideo({ src, fallbackSrc, poster, label, copy }: { src: string; fallbackSrc: string; poster: string; label: string; copy: string }) {
  return <article className="h-full"><div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-shell"><div className="relative shrink-0"><video poster={poster} controls playsInline preload="metadata" aria-label={`${label} story video`} className="aspect-square w-full object-cover object-[center_30%]"><source src={src} type="video/mp4" /><source src={fallbackSrc} type="video/webm" /></video><span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/95 px-3 py-1 text-[12px] font-semibold"><Play className="size-3" />{label}</span></div><p className="flex-1 p-4 text-[15px] leading-[23px] text-stone">{copy}</p></div></article>;
}
