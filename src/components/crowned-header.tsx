import { Link } from "@tanstack/react-router";

export function CrownedHeader({ inverse = false, sticky = false }: { inverse?: boolean; sticky?: boolean }) {
  return (
    <header className={`${sticky ? "sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur" : ""}`} aria-label="Crowned">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-5 sm:px-8">
      <Link to="/" className={`crowned-lockup inline-flex min-h-11 items-center gap-2.5 ${inverse ? "text-primary-foreground" : "text-foreground"}`}>
        <svg viewBox="0 0 30 24" className="crown-logo h-6 w-[30px]" aria-hidden="true">
          <path d="M3 8.2 8.2 13 15 3.8 21.8 13 27 8.2l-2.7 10.1H5.7L3 8.2Z" fill="currentColor" />
          <circle cx="3" cy="6.8" r="1.8" fill="currentColor" /><circle cx="15" cy="2.6" r="2.2" fill="currentColor" /><circle cx="27" cy="6.8" r="1.8" fill="currentColor" />
          <rect x="6" y="21" width="18" height="2" rx="1" fill="currentColor" />
        </svg>
        <span className="font-display text-[17px] font-semibold uppercase tracking-[0.24em]">Crowned</span>
      </Link>
      </div>
    </header>
  );
}