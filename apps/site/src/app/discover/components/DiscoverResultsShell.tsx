'use client';

import { useId, type ReactNode } from 'react';
import { List, MapPinned } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DiscoverResultsShellProps = {
  results: ReactNode;
  map: ReactNode;
  toolbar: ReactNode;
  showMobileMap?: boolean;
  onToggleMobileMap?: () => void;
};

export default function DiscoverResultsShell({
  results,
  map,
  toolbar,
  showMobileMap = false,
  onToggleMobileMap,
}: DiscoverResultsShellProps) {
  const mapId = useId();
  const isMobileMapVisible = !onToggleMobileMap || showMobileMap;
  const isMobileResultsVisible = !onToggleMobileMap || !showMobileMap;

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl">
      <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 break-words">{toolbar}</div>
        {onToggleMobileMap && (
          <Button
            type="button"
            variant="outline"
            aria-controls={mapId}
            aria-expanded={showMobileMap}
            onClick={onToggleMobileMap}
            className="min-h-11 min-w-11 rounded-full lg:hidden"
          >
            {showMobileMap ? (
              <List aria-hidden="true" size={16} />
            ) : (
              <MapPinned aria-hidden="true" size={16} />
            )}
            {showMobileMap ? 'Show results' : 'Show map'}
          </Button>
        )}
      </div>
      <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-2 lg:gap-8">
        <section
          aria-label="Discover results"
          className={cn(
            'mx-auto w-full min-w-0 max-w-2xl break-words lg:mx-0 lg:block lg:max-w-none',
            !isMobileResultsVisible && 'hidden',
          )}
        >
          {results}
        </section>
        <section
          id={mapId}
          aria-label="Discover map"
          className={cn(
            'h-[min(42rem,70dvh)] min-h-96 w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-muted lg:sticky lg:top-24 lg:block lg:h-[calc(100dvh-8rem)] lg:max-h-[52rem]',
            !isMobileMapVisible && 'hidden',
          )}
        >
          {map}
        </section>
      </div>
    </div>
  );
}
