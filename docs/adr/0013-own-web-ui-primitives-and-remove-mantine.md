---
status: accepted
---

# Own web UI primitives and remove Mantine

BracketIQ will retain React and Next.js and will replace Mantine with BracketIQ-owned shadcn/ui source based on Base UI. This choice keeps the application architecture and HTTP contracts stable while giving the web application direct control of accessible markup and visual styling.

The web UI will use Tailwind utilities, semantic OKLCH CSS variables, and CSS modules for complex or stateful surfaces. It will keep React Hook Form and existing validation behavior, use Sonner as its only notification system, and migrate one Surface at a time on the redesign branch.

Mantine can remain during the migration, but the project cannot claim that the migration is complete while any Mantine package, provider, stylesheet, PostCSS configuration, theme export, test helper, or runtime caller remains.

## Accepted responsive-layout decision

A desktop or mobile reference is one sample state, not a fixed canvas. Copied references define hierarchy and visual intent at their named viewport. They do not authorize fixed-size page canvases.

Every Route and Surface must adapt continuously from 320 CSS pixels through wide desktop. It must reflow at actual 200% browser zoom, avoid page-level two-dimensional scrolling, keep overlays in the dynamic viewport, keep 44px touch targets where applicable, honor safe areas and reduced motion, and preserve accessible keyboard and focus behavior. A product-owned table, map, or workspace may scroll horizontally only inside a bounded region. The page itself must not. Verify representative mobile, tablet, desktop, direct 320px, and actual 200% zoom for every migration slice.