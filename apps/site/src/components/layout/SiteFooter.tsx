import Link from 'next/link';

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer border-t border-border bg-background/95 text-foreground backdrop-blur">
      <div className="container-responsive flex flex-col gap-4 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="site-footer-brand font-semibold text-foreground">BracketIQ by Razumly</p>
          <p>Discover events, manage teams, and run leagues and tournaments in one place.</p>
        </div>

        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 md:pr-20"
        >
          <Link
            href="/find-events"
            className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 py-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Events
          </Link>
          <Link
            href="/find-clubs"
            className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 py-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Clubs
          </Link>
          <Link
            href="/find-facilities"
            className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 py-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Facilities
          </Link>
          <Link
            href="/guides"
            className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 py-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Guides
          </Link>
          <Link
            href="/blog"
            className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 py-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Blog
          </Link>
          <Link
            href="/privacy-policy"
            className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 py-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Privacy Policy
          </Link>
          <Link
            href="/feedback"
            className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 py-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Feedback
          </Link>
          <Link
            href="/terms"
            className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 py-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Terms & EULA
          </Link>
          <Link
            href="/delete-data"
            className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 py-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Delete Data
          </Link>
          <a
            href="mailto:support@bracket-iq.com"
            className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 py-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            support@bracket-iq.com
          </a>
          <span className="site-footer-muted text-muted-foreground">{year} BracketIQ</span>
        </nav>
      </div>
    </footer>
  );
}
