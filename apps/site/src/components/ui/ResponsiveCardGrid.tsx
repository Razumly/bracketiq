'use client';

import { ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';

type ResponsiveCardGridProps = {
  children: ReactNode;
  className?: string;
  maxCardWidth?: number;
};

const DEFAULT_MAX_CARD_WIDTH = 500;

export default function ResponsiveCardGrid({
  children,
  className,
  maxCardWidth = DEFAULT_MAX_CARD_WIDTH,
}: ResponsiveCardGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [columnCount, setColumnCount] = useState(1);

  useLayoutEffect(() => {
    const element = gridRef.current;
    if (!element) {
      return;
    }

    const computeColumns = () => {
      const styles = window.getComputedStyle(element);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || '0');
      const gapSize = Number.isFinite(gap) ? gap : 0;
      const width = element.clientWidth;

      if (!Number.isFinite(width) || width <= 0) {
        return;
      }

      const nextColumns = Math.max(1, Math.ceil((width + gapSize) / (maxCardWidth + gapSize)));
      setColumnCount((previous) => (previous === nextColumns ? previous : nextColumns));
    };

    const observer = new ResizeObserver(computeColumns);
    observer.observe(element);
    computeColumns();

    return () => observer.disconnect();
  }, [maxCardWidth]);

  const mergedClassName = useMemo(() => {
    if (!className) {
      return 'responsive-card-grid';
    }
    return `responsive-card-grid ${className}`;
  }, [className]);

  return (
    <div
      ref={gridRef}
      className={mergedClassName}
      style={{ ['--responsive-card-columns' as string]: String(columnCount) }}
    >
      {children}
    </div>
  );
}
