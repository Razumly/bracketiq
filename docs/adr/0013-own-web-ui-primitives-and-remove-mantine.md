---
status: accepted
---

# Own web UI primitives and remove Mantine

BracketIQ will retain React and Next.js and will replace Mantine with BracketIQ-owned shadcn/ui source based on Base UI. This choice keeps the application architecture and HTTP contracts stable while giving the web application direct control of accessible markup and visual styling.

The web UI will use Tailwind utilities, semantic OKLCH CSS variables, and CSS modules for complex or stateful surfaces. It will keep React Hook Form and existing validation behavior, use Sonner as its only notification system, and migrate one Surface at a time on the redesign branch.

Mantine can remain during the migration, but the project cannot claim that the migration is complete while any Mantine package, provider, stylesheet, PostCSS configuration, theme export, test helper, or runtime caller remains.