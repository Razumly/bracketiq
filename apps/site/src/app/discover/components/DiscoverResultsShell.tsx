'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

export type DiscoverResultsShellProps = {
  search: ReactNode;
  results: ReactNode;
  map: ReactNode;
  toolbar: ReactNode;
};

export default function DiscoverResultsShell({
  search,
  results,
  map,
  toolbar,
}: DiscoverResultsShellProps) {
  const searchSectionRef = useRef<HTMLDivElement | null>(null);
  const resultsSplitRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const searchSection = searchSectionRef.current;
    const resultsSplit = resultsSplitRef.current;
    if (!searchSection || !resultsSplit) return;

    const updateMapTopOffset = () => {
      const styles = window.getComputedStyle(searchSection);
      if (styles.position !== 'sticky') {
        resultsSplit.style.removeProperty('--discover-map-top-offset');
        return;
      }

      const stickyTop = Number.parseFloat(styles.top);
      const normalizedStickyTop = Number.isFinite(stickyTop) ? stickyTop : 0;
      const nextTopOffset = `${Math.max(
        0,
        normalizedStickyTop + searchSection.getBoundingClientRect().height,
      )}px`;
      if (resultsSplit.style.getPropertyValue('--discover-map-top-offset') !== nextTopOffset) {
        resultsSplit.style.setProperty('--discover-map-top-offset', nextTopOffset);
      }
    };

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateMapTopOffset);
    resizeObserver?.observe(searchSection);
    window.addEventListener('resize', updateMapTopOffset);
    updateMapTopOffset();

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateMapTopOffset);
      resultsSplit.style.removeProperty('--discover-map-top-offset');
    };
  }, []);

  return (
    <div className="discover-results-shell w-full min-w-0">
      <div ref={searchSectionRef} className="discover-search-section">
        {search}
        <div className="pb-5 min-w-0">{toolbar}</div>
      </div>
      <div ref={resultsSplitRef} className="discover-results-split">
        <section
          aria-label="Discover map"
          className="discover-map-region w-full min-w-0 overflow-hidden rounded-md border border-border bg-muted"
        >
          {map}
        </section>
        <section
          aria-label="Discover results"
          className="discover-results-region w-full min-w-0 break-words"
        >
          {results}
        </section>
      </div>
    </div>
  );
}
